const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { getPrivateDataDir } = require('./security');

const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'ListDir',
  'WebSearch',
  'WebFetch',
  'NotebookRead',
  'read_file',
  'find_by_name',
  'grep_search',
]);

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/\\~]/i,
  /rm\s+-rf\s+\*/i,
  /\bformat\s+[a-z]:/i,
  /del\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
  /Remove-Item\s+.*-Recurse.*-Force\s+['"]?[a-z]:\\['"]?$/i,
  /\bshutdown\s+\/[sr]/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
];

class AutoPilot extends EventEmitter {
  constructor() {
    super();
    this.dataFile = path.join(getPrivateDataDir(), 'autopilot.json');
    this.rules = {
      autoAllowReadOnly: false,
      autoDenyDangerous: true,
    };
    this.tasks = []; // { id, text, done, createdAt, updatedAt }
    this.reminders = []; // { id, text, dueAt, fired, createdAt }
    this.focusStats = { xp: 0, streakDays: 1, sprintsCompleted: 0, lastSprintDate: '' };
    this.notes = '';
    this.timer = null; // { label, endAt, totalMs }
    this.timerInterval = null;
    this.reminderInterval = null;
    this.log = []; // { id, action, tool, detail, ts }
    this.load();
    this.startReminderLoop();
  }

  load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const d = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        if (d.rules) this.rules = { ...this.rules, ...d.rules };
        if (Array.isArray(d.tasks)) this.tasks = d.tasks.slice(0, 50);
        if (Array.isArray(d.reminders)) this.reminders = d.reminders.slice(0, 30);
        if (d.focusStats && typeof d.focusStats === 'object') {
          this.focusStats = { ...this.focusStats, ...d.focusStats };
        }
        if (typeof d.notes === 'string') this.notes = d.notes.slice(0, 2000);
      }
    } catch {}
  }

  save() {
    try {
      fs.writeFileSync(
        this.dataFile,
        JSON.stringify(
          {
            rules: this.rules,
            tasks: this.tasks,
            reminders: this.reminders,
            focusStats: this.focusStats,
            notes: this.notes,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {}
    this.emit('update', this.getState());
  }

  getState() {
    const level = Math.floor((this.focusStats.xp || 0) / 100) + 1;
    return {
      rules: { ...this.rules },
      tasks: this.tasks,
      reminders: this.reminders.filter((r) => !r.fired).sort((a, b) => a.dueAt - b.dueAt),
      focusStats: { ...this.focusStats, level },
      notes: this.notes,
      timer: this.timer
        ? {
            label: this.timer.label,
            endAt: this.timer.endAt,
            totalMs: this.timer.totalMs,
            remainingMs: Math.max(0, this.timer.endAt - Date.now()),
          }
        : null,
      log: this.log.slice(0, 12),
    };
  }

  awardFocusXp(points = 25, isSprint = false) {
    this.focusStats.xp = (this.focusStats.xp || 0) + points;
    if (isSprint) {
      this.focusStats.sprintsCompleted = (this.focusStats.sprintsCompleted || 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      if (this.focusStats.lastSprintDate !== today) {
        this.focusStats.streakDays = (this.focusStats.streakDays || 0) + (this.focusStats.lastSprintDate ? 1 : 0);
        this.focusStats.lastSprintDate = today;
      }
    }
    this.save();
  }

  addReminder(text, delayMinutes = 10) {
    const clean = String(text || '').trim().slice(0, 160);
    if (!clean) return this.getState();
    const mins = Math.max(0.25, Math.min(1440, Number(delayMinutes) || 10));
    const now = Date.now();
    const rem = {
      id: `rem-${now}-${Math.random().toString(36).slice(2, 5)}`,
      text: clean,
      dueAt: now + Math.round(mins * 60 * 1000),
      fired: false,
      createdAt: now,
    };
    this.reminders.unshift(rem);
    if (this.reminders.length > 30) this.reminders.length = 30;
    // Also mirror into Tasks so it shows in the user's To-Do checklist!
    this.addTask(`⏰ ${clean}`);
    this.save();
    return this.getState();
  }

  deleteReminder(id) {
    this.reminders = this.reminders.filter((r) => r.id !== id);
    this.save();
    return this.getState();
  }

  startReminderLoop() {
    if (this.reminderInterval) clearInterval(this.reminderInterval);
    this.reminderInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const r of this.reminders) {
        if (!r.fired && r.dueAt <= now) {
          r.fired = true;
          changed = true;
          this.emit('reminder-due', r);
        }
      }
      if (changed) this.save();
    }, 3000);
  }

  stopAllTimers() {
    this.stopTimer(false);
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
      this.reminderInterval = null;
    }
  }

  updateRules(patch = {}) {
    if (typeof patch.autoAllowReadOnly === 'boolean') this.rules.autoAllowReadOnly = patch.autoAllowReadOnly;
    if (typeof patch.autoDenyDangerous === 'boolean') this.rules.autoDenyDangerous = patch.autoDenyDangerous;
    this.save();
    return this.getState();
  }

  /**
   * Evaluates a live agent PermissionRequest against the user's appointed Auto-Pilot rules.
   * Returns null (ask user), { decision: 'allow', reason }, or { decision: 'deny', reason }.
   */
  evaluatePermission(item) {
    const tool = String(item.toolName || '');
    const detail = String(item.detail || '');

    if (this.rules.autoDenyDangerous) {
      for (const rx of DANGEROUS_PATTERNS) {
        if (rx.test(detail)) {
          const entry = {
            id: `ap-${Date.now()}`,
            action: 'auto-denied',
            tool,
            detail: detail.slice(0, 80),
            ts: Date.now(),
          };
          this.log.unshift(entry);
          if (this.log.length > 20) this.log.length = 20;
          this.emit('action', entry);
          this.emit('update', this.getState());
          return { decision: 'deny', reason: 'Auto-blocked dangerous command by PetFish Auto-Pilot' };
        }
      }
    }

    if (this.rules.autoAllowReadOnly && READ_ONLY_TOOLS.has(tool)) {
      const entry = {
        id: `ap-${Date.now()}`,
        action: 'auto-allowed',
        tool,
        detail: detail.slice(0, 80),
        ts: Date.now(),
      };
      this.log.unshift(entry);
      if (this.log.length > 20) this.log.length = 20;
      this.emit('action', entry);
      this.emit('update', this.getState());
      return { decision: 'allow', reason: 'Auto-allowed read-only tool' };
    }

    return null;
  }

  addTask(text) {
    const clean = String(text || '').trim().slice(0, 180);
    if (!clean) return this.getState();
    const now = Date.now();
    this.tasks.unshift({
      id: `t-${now}-${Math.random().toString(36).slice(2, 5)}`,
      text: clean,
      done: false,
      createdAt: now,
      updatedAt: now,
    });
    if (this.tasks.length > 50) this.tasks.length = 50;
    this.save();
    return this.getState();
  }

  editTask(id, text) {
    const clean = String(text || '').trim().slice(0, 180);
    if (!clean) return this.getState();
    const t = this.tasks.find((x) => x.id === id);
    if (t) {
      t.text = clean;
      t.updatedAt = Date.now();
      this.save();
    }
    return this.getState();
  }

  toggleTask(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (t) {
      t.done = !t.done;
      t.updatedAt = Date.now();
      this.save();
    }
    return this.getState();
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter((x) => x.id !== id);
    this.save();
    return this.getState();
  }

  saveNotes(text) {
    this.notes = String(text || '').slice(0, 2000);
    this.save();
    return this.getState();
  }

  startTimer(minutes, label = 'Vibe Sprint') {
    const mins = Math.max(1, Math.min(180, Number(minutes) || 25));
    const totalMs = mins * 60 * 1000;
    this.stopTimer(false);
    this.timer = {
      label: String(label || 'Vibe Sprint').slice(0, 48),
      totalMs,
      endAt: Date.now() + totalMs,
    };
    this.timerInterval = setInterval(() => {
      if (!this.timer) return;
      if (Date.now() >= this.timer.endAt) {
        const finished = this.timer;
        this.stopTimer(false);
        this.awardFocusXp(35, true);
        this.emit('timer-done', finished);
        this.emit('update', this.getState());
      }
    }, 1000);
    this.emit('update', this.getState());
    return this.getState();
  }

  stopTimer(emit = true) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timer = null;
    if (emit) this.emit('update', this.getState());
    return this.getState();
  }
}

module.exports = { AutoPilot };
