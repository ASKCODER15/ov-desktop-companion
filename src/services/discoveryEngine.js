const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const { getPrivateDataDir, writeLog } = require('./security');

const KNOWN_AGENT_KEYWORDS = [
  'claude', 'codex', 'cursor', 'windsurf', 'antigravity', 'aider', 'opencode',
  'gemini', 'goose', 'cline', 'roo', 'kiro', 'trae', 'zed', 'ollama',
  'lm studio', 'lmstudio', 'jan', 'gpt4all', 'openwebui', 'copilot', 'continue',
];

function cleanAppName(filename) {
  return String(filename || '')
    .replace(/\.(lnk|exe|msi|msix|cmd|ps1|bat|zip|appx)$/i, '')
    .replace(/[-_](setup|installer|x64|win64|arm64|v?\d+\.\d+[\d.-]*)$/gi, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 48);
}

function isAgentName(name) {
  const l = String(name || '').toLowerCase();
  return KNOWN_AGENT_KEYWORDS.some((k) => l.includes(k));
}

function isTrackableFilename(file, watchKind) {
  if (!file || file.startsWith('.') || file.endsWith('.tmp') || file.endsWith('.crdownload') || file.endsWith('.part')) {
    return false;
  }
  const lower = file.toLowerCase();
  if (watchKind === 'downloads') {
    return /\.(exe|msi|msix|appx)$/i.test(lower);
  }
  if (watchKind === 'startmenu') {
    return /\.lnk$/i.test(lower) && !/uninstall|readme|help|license/i.test(lower);
  }
  if (watchKind === 'cli') {
    return /\.(cmd|exe)$/i.test(lower) && isAgentName(lower);
  }
  if (watchKind === 'programs') {
    return !/^(temp|cache|updater|uninstall)/i.test(lower);
  }
  return false;
}

/**
 * Zero-Delay New App & Agent Auto-Discovery Engine:
 * Watches Start Menu, Local Programs, Downloads (installers), and CLI agent bins
 * using native OS kernel fs.watch (zero polling CPU overhead!).
 */
class DiscoveryEngine extends EventEmitter {
  constructor() {
    super();
    this.dataFile = path.join(getPrivateDataDir(), 'discovered.json');
    this.watchers = [];
    this.knownSnapshots = new Map(); // dir -> Set<filename>
    this.recentDiscoveries = []; // { id, name, kind, isAgent, path, detectedAt }
    this.installedAgents = []; // { name, processHint, source }
    this.recentEmitMap = new Map(); // dedupe key -> timestamp
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const d = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        if (Array.isArray(d.recentDiscoveries)) this.recentDiscoveries = d.recentDiscoveries.slice(0, 20);
      }
    } catch {}
  }

  save() {
    try {
      fs.writeFileSync(
        this.dataFile,
        JSON.stringify({ recentDiscoveries: this.recentDiscoveries.slice(0, 20) }, null, 2),
        'utf8'
      );
    } catch {}
  }

  getWatchTargets() {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
    return [
      { dir: path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), kind: 'startmenu' },
      { dir: path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), kind: 'startmenu' },
      { dir: path.join(localAppData, 'Programs'), kind: 'programs' },
      { dir: path.join(home, 'Downloads'), kind: 'downloads' },
      { dir: path.join(appData, 'npm'), kind: 'cli' },
      { dir: path.join(home, '.local', 'bin'), kind: 'cli' },
    ];
  }

  start() {
    const targets = this.getWatchTargets();
    const detectedAgentSet = new Map();

    for (const t of targets) {
      if (!fs.existsSync(t.dir)) continue;

      // Build initial baseline snapshot (do NOT spam alerts for already-installed apps)
      const initialSet = new Set();
      try {
        for (const f of fs.readdirSync(t.dir)) {
          initialSet.add(f);
          if (isTrackableFilename(f, t.kind)) {
            const clean = cleanAppName(f);
            if (clean && isAgentName(clean)) {
              detectedAgentSet.set(clean.toLowerCase(), {
                name: clean,
                processHint: clean.split(' ')[0],
                source: t.kind,
              });
            }
          }
        }
      } catch {}
      this.knownSnapshots.set(t.dir, initialSet);

      // Attach zero-delay OS fs.watch listener
      try {
        const w = fs.watch(t.dir, (_, filename) => {
          if (!filename) return;
          this.handleFsEvent(t.dir, t.kind, String(filename));
        });
        w.on('error', () => {});
        this.watchers.push(w);
      } catch {}
    }

    this.installedAgents = Array.from(detectedAgentSet.values()).slice(0, 16);
    writeLog('INFO', `DiscoveryEngine watching ${this.watchers.length} dirs (${this.installedAgents.length} installed AI tools indexed)`);
  }

  handleFsEvent(dir, kind, filename) {
    const snap = this.knownSnapshots.get(dir);
    if (!snap || snap.has(filename)) return;

    const fullPath = path.join(dir, filename);
    if (!fs.existsSync(fullPath)) return;

    snap.add(filename);
    if (!isTrackableFilename(filename, kind)) return;

    const name = cleanAppName(filename);
    if (!name || name.length < 2) return;

    // Dedupe rapid installer bursts (e.g. .exe + .lnk created within 15s)
    const dedupeKey = name.toLowerCase();
    const now = Date.now();
    if (now - (this.recentEmitMap.get(dedupeKey) || 0) < 15000) return;
    this.recentEmitMap.set(dedupeKey, now);

    const agentFlag = isAgentName(name);
    const entry = {
      id: `disc-${now}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      kind, // 'downloads' | 'startmenu' | 'programs' | 'cli'
      isAgent: agentFlag,
      processHint: name.split(' ')[0],
      path: fullPath,
      detectedAt: now,
    };

    this.recentDiscoveries.unshift(entry);
    if (this.recentDiscoveries.length > 20) this.recentDiscoveries.length = 20;

    if (agentFlag && !this.installedAgents.some((a) => a.name.toLowerCase() === dedupeKey)) {
      this.installedAgents.unshift({ name, processHint: entry.processHint, source: kind });
    }

    this.save();
    writeLog('INFO', `Auto-discovered new ${agentFlag ? 'AI agent/tool' : 'app'}: ${name} (${kind})`);
    this.emit('discovered', entry);
  }

  stop() {
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
  }

  getState() {
    return {
      recentDiscoveries: this.recentDiscoveries.slice(0, 8),
      installedAgents: this.installedAgents,
    };
  }
}

module.exports = { DiscoveryEngine };
