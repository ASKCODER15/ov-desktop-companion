const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_MARKERS = ['PetFish', 'nemo-agent-pet'];

function getSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function getHookScriptPath() {
  return path.resolve(__dirname, '..', '..', 'scripts', 'claude-hook.js');
}

function isManagedEntry(entry) {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(
    (h) => typeof h.command === 'string' && HOOK_MARKERS.some((m) => h.command.includes(m))
  );
}

function getHookStatus() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return { installed: false, claudeDirExists: fs.existsSync(path.dirname(settingsPath)), settingsPath };
  }
  try {
    const json = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const hooks = json.hooks || {};
    const installed = ['PermissionRequest', 'PreToolUse', 'Notification', 'Stop'].some(
      (ev) => Array.isArray(hooks[ev]) && hooks[ev].some(isManagedEntry)
    );
    return { installed, claudeDirExists: true, settingsPath };
  } catch (err) {
    return { installed: false, claudeDirExists: true, settingsPath, error: err.message };
  }
}

function installClaudeHooks() {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  let json = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const backupPath = `${settingsPath}.petfish-backup`;
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, raw, 'utf8');
    }
    json = JSON.parse(raw);
  }

  if (!json.hooks || typeof json.hooks !== 'object') {
    json.hooks = {};
  }

  const scriptPath = getHookScriptPath().replace(/\\/g, '/');
  const events = [
    { name: 'PermissionRequest', timeout: 125 },
    { name: 'PreToolUse', timeout: 5 },
    { name: 'Notification', timeout: 5 },
    { name: 'Stop', timeout: 5 },
  ];

  for (const ev of events) {
    const existing = Array.isArray(json.hooks[ev.name]) ? json.hooks[ev.name] : [];
    const cleaned = existing.filter((entry) => !isManagedEntry(entry));
    cleaned.push({
      matcher: '*',
      hooks: [
        {
          type: 'command',
          command: `node "${scriptPath}" ${ev.name}`,
          timeout: ev.timeout,
        },
      ],
    });
    json.hooks[ev.name] = cleaned;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2), 'utf8');
  return { ok: true, installed: true, settingsPath };
}

function uninstallClaudeHooks() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) return { ok: true, installed: false };
  const json = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (json.hooks && typeof json.hooks === 'object') {
    for (const key of Object.keys(json.hooks)) {
      if (Array.isArray(json.hooks[key])) {
        json.hooks[key] = json.hooks[key].filter((entry) => !isManagedEntry(entry));
        if (json.hooks[key].length === 0) delete json.hooks[key];
      }
    }
  }
  fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2), 'utf8');
  return { ok: true, installed: false };
}

module.exports = { getHookStatus, installClaudeHooks, uninstallClaudeHooks };
