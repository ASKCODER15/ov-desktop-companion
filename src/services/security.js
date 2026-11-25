const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'config', 'security.json');
const LOG_DIR = path.resolve(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'petfish.log');

function loadSecurityConfig() {
  const defaults = {
    bindHost: '127.0.0.1',
    hookPort: 47821,
    requireAuthToken: true,
    rejectCrossOrigin: true,
    maxPayloadBytes: 131072,
    rateLimitPerMinute: 120,
    outboundNetworkAllowed: false,
    privateDataDirName: 'PetFish',
    privacyMaskDefault: false,
    logNotificationBodies: false,
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch {}
  return defaults;
}

const securityConfig = loadSecurityConfig();

function getPrivateDataDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dir = path.join(base, securityConfig.privateDataDirName || 'PetFish');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getAuthTokenPath() {
  return path.join(getPrivateDataDir(), '.auth-token');
}

/**
 * Restricts a sensitive file to the current Windows user only via icacls (no shared read access).
 */
function lockFileToCurrentUser(filePath) {
  if (process.platform !== 'win32') return;
  const user = process.env.USERNAME;
  if (!user) return;
  execFile(
    'icacls.exe',
    [filePath, '/inheritance:r', '/grant:r', `${user}:(R,W)`],
    { windowsHide: true, timeout: 3000 },
    () => {}
  );
}

/**
 * Loads or generates the 256-bit local API auth token used between PetFish and Claude Code hooks.
 */
function ensureAuthToken() {
  const tokenPath = getAuthTokenPath();
  try {
    if (fs.existsSync(tokenPath)) {
      const existing = fs.readFileSync(tokenPath, 'utf8').trim();
      if (/^[a-f0-9]{64}$/i.test(existing)) {
        return existing;
      }
    }
  } catch {}

  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  lockFileToCurrentUser(tokenPath);
  return token;
}

function verifyTokenConstantTime(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAllowedHostHeader(hostHeader, port) {
  if (!hostHeader) return false;
  const h = String(hostHeader).toLowerCase().trim();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

class SlidingRateLimiter {
  constructor(maxPerMinute = 120) {
    this.maxPerMinute = maxPerMinute;
    this.timestamps = [];
  }

  allow() {
    const now = Date.now();
    const cutoff = now - 60000;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxPerMinute) return false;
    this.timestamps.push(now);
    return true;
  }
}

// Strict IPC validators + seamless backward-compatibility migration via heroRegistry
const {
  BUILTIN_HERO_IDS,
  DEFAULT_CHAR_NAMES,
  DEFAULT_CHAR_SKINS,
  LEGACY_DEFAULT_NAMES,
  resolveHeroId,
  normalizeSkinForHero,
  resolveAgeProfileId,
  isCustomHeroId,
} = require('./heroRegistry');

const VALID_PET_MODES = new Set(['swim', 'fast', 'slow', 'stay', 'follow']);
const VALID_PET_CHARS = new Set(BUILTIN_HERO_IDS);
const VALID_AGE_GROUPS = new Set(['0-15', '1-15', '15-30', '30-60']);
const VALID_DISPLAY_MODES = new Set(['floating', 'desktop-only']);
const VALID_DECISIONS = new Set(['allow', 'deny', 'passthrough']);

function normalizeCharacterId(raw, customHeroes = []) {
  return resolveHeroId(raw, customHeroes);
}

function normalizeSkinId(charKey, rawSkin) {
  return normalizeSkinForHero(charKey, rawSkin);
}

function sanitizeSettingsPatch(patch, customHeroes = []) {
  if (!patch || typeof patch !== 'object') return {};
  const clean = {};
  if (VALID_DISPLAY_MODES.has(patch.displayMode)) clean.displayMode = patch.displayMode;
  if (VALID_PET_MODES.has(patch.petMode)) clean.petMode = patch.petMode;
  if (patch.petCharacter !== undefined) {
    const mappedChar = normalizeCharacterId(patch.petCharacter, customHeroes);
    if (mappedChar) {
      clean.petCharacter = mappedChar;
      clean.unresolvedCharacter = null;
    } else if (typeof patch.petCharacter === 'string' && patch.petCharacter.trim()) {
      // Preserve unknown character ID without blindly overwriting so the user can choose a replacement
      clean.unresolvedCharacter = patch.petCharacter.replace(/[<>"]/g, '').trim().slice(0, 32);
    }
  }
  if (VALID_AGE_GROUPS.has(patch.ageGroup)) clean.ageGroup = resolveAgeProfileId(patch.ageGroup);
  if (typeof patch.wakeOnAlerts === 'boolean') clean.wakeOnAlerts = patch.wakeOnAlerts;
  if (typeof patch.showAlertBubbles === 'boolean') clean.showAlertBubbles = patch.showAlertBubbles;
  if (typeof patch.privacyMask === 'boolean') clean.privacyMask = patch.privacyMask;
  if (typeof patch.voiceEnabled === 'boolean') clean.voiceEnabled = patch.voiceEnabled;
  if (typeof patch.bgmEnabled === 'boolean') clean.bgmEnabled = patch.bgmEnabled;
  if (typeof patch.danceModeEnabled === 'boolean') clean.danceModeEnabled = patch.danceModeEnabled;
  if (typeof patch.selectedVoice === 'string' && /^[a-z0-9_-]{2,24}$/i.test(patch.selectedVoice.trim())) {
    clean.selectedVoice = patch.selectedVoice.trim().toLowerCase();
  }
  if (typeof patch.autoStart === 'boolean') clean.autoStart = patch.autoStart;
  if (typeof patch.thinkMode === 'boolean') clean.thinkMode = patch.thinkMode;
  if (typeof patch.glassTransparency === 'number' && Number.isFinite(patch.glassTransparency)) {
    clean.glassTransparency = Math.max(0, Math.min(100, Math.round(patch.glassTransparency)));
  }
  if (typeof patch.fishScale === 'number' && Number.isFinite(patch.fishScale)) {
    clean.fishScale = Math.max(0.7, Math.min(1.45, Math.round(patch.fishScale * 100) / 100));
  }
  if (patch.petSkins && typeof patch.petSkins === 'object') {
    const skins = {};
    for (const [rawKey, rawVal] of Object.entries(patch.petSkins)) {
      const c = normalizeCharacterId(rawKey, customHeroes);
      const s = normalizeSkinId(c, rawVal);
      if (c && s) skins[c] = s;
    }
    if (Object.keys(skins).length > 0) clean.petSkins = skins;
  }
  if (patch.petNames && typeof patch.petNames === 'object') {
    const names = {};
    for (const [rawKey, rawVal] of Object.entries(patch.petNames)) {
      const c = normalizeCharacterId(rawKey, customHeroes);
      if (c && typeof rawVal === 'string') {
        const trimmed = rawVal.replace(/[<>"]/g, '').trim().slice(0, 24);
        if (trimmed) {
          // Upgrade untouched legacy default names cleanly while keeping any custom user nickname!
          names[c] = LEGACY_DEFAULT_NAMES.has(trimmed.toLowerCase()) ? (DEFAULT_CHAR_NAMES[c] || trimmed) : trimmed;
        }
      }
    }
    if (Object.keys(names).length > 0) clean.petNames = names;
  }
  if (patch.savedPos && typeof patch.savedPos === 'object') {
    const x = Number(patch.savedPos.x);
    const y = Number(patch.savedPos.y);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < 16000 && y < 16000) {
      clean.savedPos = { x: Math.round(x), y: Math.round(y) };
    }
  }
  return clean;
}

function sanitizeProcessHint(hint) {
  if (typeof hint !== 'string') return '';
  return hint.replace(/[^a-zA-Z0-9._ -]/g, '').trim().slice(0, 64);
}

function writeLog(level, message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    // Simple 256 KB rotation so logs never grow unbounded
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 262144) {
      const prev = path.join(LOG_DIR, 'petfish.prev.log');
      try { fs.unlinkSync(prev); } catch {}
      fs.renameSync(LOG_FILE, prev);
    }
    const line = `[${new Date().toISOString()}] [${level}] ${String(message).slice(0, 400)}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {}
}

module.exports = {
  securityConfig,
  getPrivateDataDir,
  getAuthTokenPath,
  lockFileToCurrentUser,
  ensureAuthToken,
  verifyTokenConstantTime,
  isAllowedHostHeader,
  SlidingRateLimiter,
  VALID_DECISIONS,
  VALID_PET_CHARS,
  DEFAULT_CHAR_NAMES,
  DEFAULT_CHAR_SKINS,
  normalizeCharacterId,
  normalizeSkinId,
  sanitizeSettingsPatch,
  sanitizeProcessHint,
  writeLog,
};
