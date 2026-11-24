const EventEmitter = require('events');

/**
 * Minimal In-Memory Copy & Paste Vault (Privacy-First):
 * - Keeps the last 16 text snippets in RAM ONLY (never written to disk or Git!).
 * - Supports 1-click Copy Back, Pin, Delete, Clear, and "Explain with AI Lens".
 */
class ClipboardVault extends EventEmitter {
  constructor(clipboardApi) {
    super();
    this.clipboard = clipboardApi;
    this.items = []; // { id, text, preview, pinned, ts }
    this.lastSeen = '';
    this.timer = null;
  }

  start() {
    if (!this.clipboard) return;
    try {
      this.lastSeen = String(this.clipboard.readText() || '');
      if (this.lastSeen.trim()) this.capture(this.lastSeen);
    } catch {}
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.poll(), 1800);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  poll() {
    if (!this.clipboard) return;
    try {
      const txt = String(this.clipboard.readText() || '');
      if (txt && txt !== this.lastSeen) {
        this.lastSeen = txt;
        this.capture(txt);
      }
    } catch {}
  }

  capture(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean || clean.length > 8000) return;
    // Dedupe identical top item or move existing to top
    const existingIdx = this.items.findIndex((x) => x.text === clean);
    let pinned = false;
    if (existingIdx !== -1) {
      pinned = this.items[existingIdx].pinned;
      this.items.splice(existingIdx, 1);
    }
    this.items.unshift({
      id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      text: clean,
      preview: clean.replace(/\s+/g, ' ').slice(0, 120),
      pinned,
      ts: Date.now(),
    });
    // Keep pinned items + most recent up to 16 total
    const pinnedItems = this.items.filter((x) => x.pinned);
    const unpinned = this.items.filter((x) => !x.pinned).slice(0, Math.max(6, 16 - pinnedItems.length));
    this.items = [...pinnedItems, ...unpinned].sort((a, b) => (a.pinned === b.pinned ? b.ts - a.ts : a.pinned ? -1 : 1));
    this.emit('update', this.getItems());
  }

  getItems() {
    return this.items.map((x) => ({
      id: x.id,
      text: x.text,
      preview: x.preview,
      pinned: x.pinned,
      ts: x.ts,
    }));
  }

  getLatestText() {
    this.poll();
    return this.items[0]?.text || this.lastSeen || '';
  }

  copyItem(id) {
    const found = this.items.find((x) => x.id === id);
    if (!found || !this.clipboard) return false;
    this.lastSeen = found.text;
    this.clipboard.writeText(found.text);
    return true;
  }

  togglePin(id) {
    const found = this.items.find((x) => x.id === id);
    if (found) {
      found.pinned = !found.pinned;
      this.items.sort((a, b) => (a.pinned === b.pinned ? b.ts - a.ts : a.pinned ? -1 : 1));
      this.emit('update', this.getItems());
    }
    return this.getItems();
  }

  deleteItem(id) {
    this.items = this.items.filter((x) => x.id !== id);
    this.emit('update', this.getItems());
    return this.getItems();
  }

  clearUnpinned() {
    this.items = this.items.filter((x) => x.pinned);
    this.emit('update', this.getItems());
    return this.getItems();
  }
}

module.exports = { ClipboardVault };
