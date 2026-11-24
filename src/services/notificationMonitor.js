const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const EventEmitter = require('events');
const { getPrivateDataDir, lockFileToCurrentUser } = require('./security');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const FILETIME_EPOCH_DIFF = 116444736000000000n;

function filetimeToMs(ftStr) {
  try {
    if (!ftStr || ftStr === '0') return Date.now();
    const bi = BigInt(ftStr);
    if (bi <= FILETIME_EPOCH_DIFF) return Date.now();
    return Number((bi - FILETIME_EPOCH_DIFF) / 10000n);
  } catch {
    return Date.now();
  }
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function parseToastXml(xmlText) {
  if (!xmlText) return { title: '', body: '', lines: [], launch: '' };
  const lines = [];
  const textRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textRegex.exec(xmlText)) !== null) {
    const cleaned = decodeXmlEntities(match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (cleaned) lines.push(cleaned);
  }
  const launchMatch = xmlText.match(/launch="([^"]*)"/i);
  const launch = launchMatch ? decodeXmlEntities(launchMatch[1]) : '';
  return {
    title: lines[0] || '',
    body: lines.slice(1).join(' — ') || '',
    lines,
    launch,
  };
}

function classifyHandler(primaryId = '', parsed = {}) {
  const id = String(primaryId || '');
  const lower = id.toLowerCase();
  const combined = `${parsed.title || ''} ${parsed.body || ''} ${parsed.launch || ''}`.toLowerCase();

  if (lower.includes('whatsapp') || combined.includes('web.whatsapp.com')) {
    return { category: 'whatsapp', appName: 'WhatsApp', accent: '#25D366', processHint: 'WhatsApp' };
  }
  if (lower.includes('antigravity')) {
    return { category: 'agent', appName: 'Antigravity', accent: '#38BDF8', processHint: 'Antigravity' };
  }
  if (lower.includes('claude')) {
    return { category: 'agent', appName: 'Claude Code', accent: '#F59E0B', processHint: 'claude' };
  }
  if (lower.includes('cursor') || lower.includes('codex') || lower.includes('windsurf') || lower.includes('vscode') || lower.includes('visual studio code')) {
    const pretty = lower.includes('cursor')
      ? 'Cursor'
      : lower.includes('codex')
        ? 'Codex'
        : lower.includes('windsurf')
          ? 'Windsurf'
          : 'VS Code';
    return { category: 'agent', appName: pretty, accent: '#A78BFA', processHint: pretty.replace(/\s+/g, '') };
  }
  if (lower.includes('telegram')) return { category: 'social', appName: 'Telegram', accent: '#38BDF8', processHint: 'Telegram' };
  if (lower.includes('discord')) return { category: 'social', appName: 'Discord', accent: '#818CF8', processHint: 'Discord' };
  if (lower.includes('slack')) return { category: 'social', appName: 'Slack', accent: '#E879F9', processHint: 'slack' };
  if (lower.includes('brave')) return { category: 'browser', appName: 'Brave', accent: '#FB542B', processHint: 'brave' };
  if (lower.includes('spotify')) return { category: 'social', appName: 'Spotify', accent: '#1DB954', processHint: 'Spotify' };
  if (lower.includes('chrome')) return { category: 'browser', appName: 'Chrome', accent: '#60A5FA', processHint: 'chrome' };
  if (lower.includes('msedge') || lower.includes('edge')) return { category: 'browser', appName: 'Edge', accent: '#60A5FA', processHint: 'msedge' };

  let cleanName = id.split('!')[0].split('\\').pop() || 'Windows';
  cleanName = cleanName
    .replace(/^[A-F0-9]{8,}\./i, '')
    .replace(/_[a-z0-9]{10,}$/i, '')
    .replace(/^Microsoft\.Windows\./i, '')
    .replace(/^Windows\.SystemToast\./i, '')
    .replace(/^com\./i, '')
    .replace(/^electron\.app\./i, '')
    .replace(/\./g, ' ')
    .trim() || 'System';
  cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

  return { category: 'system', appName: cleanName.slice(0, 28), accent: '#94A3B8', processHint: cleanName.split(' ')[0] };
}

class NotificationMonitor extends EventEmitter {
  constructor() {
    super();
    this.wpnDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications');
    // Private user-only snapshot directory (never shared system TEMP)
    this.privateTmpDir = path.join(getPrivateDataDir(), 'tmp-wpn');
    this.seenIds = new Set();
    this.notifications = [];
    this.customNotifications = [];
    this.dismissedIds = new Set();
    this.readIds = new Set();
    this.initialized = false;
    this.watcher = null;
    this.pollTimer = null;
    this.debounceTimer = null;
    this.isReading = false;
  }

  start() {
    this.poll().catch(() => {});

    try {
      if (fs.existsSync(this.wpnDir)) {
        this.watcher = fs.watch(this.wpnDir, () => {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.poll().catch(() => {});
          }, 450);
        });
        this.watcher.on('error', () => {});
      }
    } catch {}

    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {});
    }, 3000);
  }

  stop() {
    if (this.watcher) {
      try { this.watcher.close(); } catch {}
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cleanupSnapshot();
  }

  cleanupSnapshot() {
    try {
      fs.rmSync(this.privateTmpDir, { recursive: true, force: true });
    } catch {}
  }

  pushCustomNotification({ appName, title, body, category = 'agent', accent = '#FF7426', processHint = '' }) {
    const item = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'custom',
      category,
      appName: appName || 'Agent',
      title: title || appName || 'Notification',
      body: body || '',
      accent,
      processHint,
      timestamp: Date.now(),
      unread: true,
    };
    this.customNotifications.unshift(item);
    if (this.customNotifications.length > 40) this.customNotifications.length = 40;
    this.emit('new', item);
    this.emit('update', this.getAll());
    return item;
  }

  markRead(id) {
    if (id === 'all') {
      for (const n of this.notifications) this.readIds.add(n.id);
      for (const n of this.customNotifications) n.unread = false;
    } else {
      this.readIds.add(id);
      const custom = this.customNotifications.find((c) => c.id === id);
      if (custom) custom.unread = false;
    }
    this.emit('update', this.getAll());
  }

  dismiss(id) {
    if (id === 'all') {
      for (const n of this.notifications) this.dismissedIds.add(n.id);
      this.customNotifications = [];
    } else {
      this.dismissedIds.add(id);
      this.customNotifications = this.customNotifications.filter((c) => c.id !== id);
    }
    this.emit('update', this.getAll());
  }

  getAll() {
    const wpn = this.notifications
      .filter((n) => !this.dismissedIds.has(n.id))
      .map((n) => ({ ...n, unread: !this.readIds.has(n.id) }));
    const merged = [...this.customNotifications, ...wpn];
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, 60);
  }

  getUnreadCount() {
    return this.getAll().filter((n) => n.unread).length;
  }

  async poll() {
    if (this.isReading) return;
    const dbPath = path.join(this.wpnDir, 'wpndatabase.db');
    if (!fs.existsSync(dbPath)) return;

    this.isReading = true;
    try {
      const rows = await this.readWpnRows();
      if (!rows) return;

      const parsedItems = [];
      const freshItems = [];

      for (const row of rows) {
        const parsed = parseToastXml(row.payloadText || '');
        if (!parsed.title && !parsed.body) continue;

        const cls = classifyHandler(row.primaryId, parsed);
        const id = `wpn-${row.id}`;
        const timestamp = filetimeToMs(row.arrivalTime);

        const item = {
          id,
          source: 'windows',
          rawId: row.id,
          handlerId: row.primaryId || '',
          category: cls.category,
          appName: cls.appName,
          title: parsed.title || cls.appName,
          body: parsed.body || (parsed.title !== cls.appName ? '' : 'New notification'),
          accent: cls.accent,
          processHint: cls.processHint,
          timestamp,
          unread: !this.readIds.has(id),
        };

        if (item.category === 'whatsapp' && !item.body && item.title) {
          item.body = item.title;
          item.title = 'WhatsApp';
        }

        parsedItems.push(item);

        if (!this.seenIds.has(id)) {
          this.seenIds.add(id);
          if (!this.initialized) {
            if (Date.now() - timestamp > 90000) {
              this.readIds.add(id);
              item.unread = false;
            }
          } else {
            freshItems.push(item);
          }
        }
      }

      const prevCount = this.notifications.length;
      const prevTopId = this.notifications[0]?.id;
      this.notifications = parsedItems;
      this.initialized = true;

      for (const fresh of freshItems.reverse()) {
        this.emit('new', fresh);
      }

      if (freshItems.length > 0 || prevCount !== parsedItems.length || prevTopId !== parsedItems[0]?.id) {
        this.emit('update', this.getAll());
      }
    } catch {
      // Quietly retry on next tick if WPN database was mid-flush
    } finally {
      this.cleanupSnapshot();
      this.isReading = false;
    }
  }

  copySnapshot() {
    if (!fs.existsSync(this.privateTmpDir)) {
      fs.mkdirSync(this.privateTmpDir, { recursive: true });
      lockFileToCurrentUser(this.privateTmpDir);
    }
    const snapDb = path.join(this.privateTmpDir, 'wpndatabase.db');
    for (const suffix of ['', '-wal', '-shm']) {
      const src = path.join(this.wpnDir, `wpndatabase.db${suffix}`);
      const dst = path.join(this.privateTmpDir, `wpndatabase.db${suffix}`);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, dst);
        } catch {
          // One quick retry if WPN flushed mid-copy
          fs.copyFileSync(src, dst);
        }
      } else if (fs.existsSync(dst)) {
        try { fs.unlinkSync(dst); } catch {}
      }
    }
    return snapDb;
  }

  async readWpnRows() {
    const snapDb = this.copySnapshot();
    if (DatabaseSync) {
      let db = null;
      try {
        db = new DatabaseSync(snapDb, { readOnly: true });
        const rows = db.prepare(`
          SELECT
            n.Id AS id,
            n.Type AS type,
            CAST(n.ArrivalTime AS TEXT) AS arrivalTime,
            h.PrimaryId AS primaryId,
            n.Payload AS payload
          FROM Notification n
          LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId
          WHERE n.Type = 'toast' AND n.Payload IS NOT NULL
          ORDER BY n.ArrivalTime DESC
          LIMIT 45
        `).all();
        return rows.map((r) => ({
          id: r.id,
          type: r.type,
          arrivalTime: r.arrivalTime,
          primaryId: r.primaryId || '',
          payloadText: r.payload ? Buffer.from(r.payload).toString('utf8') : '',
        }));
      } finally {
        if (db) {
          try { db.close(); } catch {}
        }
      }
    }

    return new Promise((resolve) => {
      const pyScript = `
import sqlite3, json, sys
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
cur = con.cursor()
cur.execute("""
SELECT n.Id, n.Type, CAST(n.ArrivalTime AS TEXT), COALESCE(h.PrimaryId, ''), n.Payload
FROM Notification n
LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId
WHERE n.Type = 'toast' AND n.Payload IS NOT NULL
ORDER BY n.ArrivalTime DESC
LIMIT 45
""")
out = []
for row in cur.fetchall():
    payload = row[4]
    if isinstance(payload, bytes):
        payload = payload.decode('utf-8', errors='ignore')
    out.append({"id": row[0], "type": row[1], "arrivalTime": row[2], "primaryId": row[3], "payloadText": payload or ""})
con.close()
print(json.dumps(out))
`;
      execFile('python', ['-c', pyScript, snapDb], { maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try { resolve(JSON.parse(stdout)); } catch { resolve([]); }
      });
    });
  }
}

module.exports = { NotificationMonitor };
