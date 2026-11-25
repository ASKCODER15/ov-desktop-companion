const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPrivateDataDir, writeLog } = require('./security');
const {
  VALID_MOVEMENT_ARCHETYPES,
  VALID_REACTION_STYLES,
  VALID_VOICE_PROFILES,
  VALID_SOUND_PACKS,
  VALID_TEMPLATES,
  VALID_COMPANION_CATEGORIES,
} = require('./heroRegistry');

const MAX_CUSTOM_HEROES = 24;
const MAX_ARTWORK_BYTES = 380 * 1024; // ~380 KB max local raster image
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/;
const VALID_THEMES = new Set(['spidey', 'ironman', 'batman', 'nemo', 'kronos', 'optix', 'orbit', 'custom']);
const LEGACY_CUSTOM_MOVEMENT = { waddle: 'stride', prowl: 'scout', trot: 'drone' };
const LEGACY_CUSTOM_TEMPLATE = { capybara: 'kronos', cat: 'optix', dog: 'orbit' };
const LEGACY_CUSTOM_VOICE = { capybara: 'kronos', cat: 'optix', dog: 'orbit' };
const LEGACY_CUSTOM_SOUND = { capybara: 'kronos', cat: 'optix', dog: 'orbit' };
const LEGACY_CUSTOM_REACTION = { calm: 'pulse', paw: 'scan' };

function sanitizeText(val, maxLen, fallback = '') {
  const s = String(val ?? '')
    .replace(/[\u0000-\u001f<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || fallback;
}

function sanitizeHex(val, fallback) {
  const s = String(val || '').trim();
  return HEX_RE.test(s) ? s.toLowerCase() : fallback;
}

/**
 * Strictly validates an optional local raster image data URL (PNG, JPEG, WebP only).
 * Rejects SVG (prevents script injection), HTML, oversized files, and invalid magic bytes.
 */
function validateArtworkDataUrl(raw) {
  if (!raw) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'Artwork must be a data URL string.' };
  const trimmed = raw.trim();
  const match = trimmed.match(SAFE_DATA_IMAGE_RE);
  if (!match) {
    return { ok: false, error: 'Only PNG, JPEG, or WebP raster images are allowed (SVG/scripts blocked).' };
  }
  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const b64 = match[2].replace(/\s+/g, '');
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, error: 'Invalid base64 image data.' };
  }
  if (buf.length < 16 || buf.length > MAX_ARTWORK_BYTES) {
    return { ok: false, error: `Artwork image must be between 16 bytes and ${Math.round(MAX_ARTWORK_BYTES / 1024)} KB.` };
  }
  // Verify actual raster magic bytes so disguised text/scripts can never pass
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if ((mime === 'png' && !isPng) || (mime === 'jpeg' && !isJpeg) || (mime === 'webp' && !isWebp)) {
    return { ok: false, error: 'Image file header does not match its declared format.' };
  }
  return { ok: true, value: `data:image/${mime};base64,${b64}` };
}

/**
 * Validates and normalizes a Custom Hero configuration object.
 * Never allows executable fields, code strings, or unrestricted system properties.
 */
function validateCustomHeroInput(input, existingId = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Hero configuration must be a JSON object.' };
  }

  const name = sanitizeText(input.name, 28);
  if (!name) return { ok: false, error: 'Hero name is required (1–28 characters).' };

  const nickname = sanitizeText(input.nickname, 24, name);
  const rawCat = input.category === 'animal' ? 'robot' : input.category;
  const category = VALID_COMPANION_CATEGORIES.has(rawCat) ? rawCat : 'robot';
  const title = sanitizeText(input.title, 32, category === 'robot' ? 'Custom Robot Agent' : category === 'custom' ? 'Custom Unit' : 'Custom Hero');
  const mappedTpl = LEGACY_CUSTOM_TEMPLATE[input.template] || input.template;
  const template = VALID_TEMPLATES.has(mappedTpl) ? mappedTpl : (category === 'robot' ? 'kronos' : 'acrobat');
  const primaryColor = sanitizeHex(input.primaryColor, '#ff5500');
  const secondaryColor = sanitizeHex(input.secondaryColor, '#00d68f');
  const accentColor = sanitizeHex(input.accentColor, '#f2efe9');
  const theme = VALID_THEMES.has(input.theme) ? input.theme : 'custom';
  const personality = sanitizeText(
    input.personality,
    180,
    'Autonomous research and heavy-task robot companion'
  );
  const mappedVoice = LEGACY_CUSTOM_VOICE[input.voiceProfile] || input.voiceProfile;
  const voiceProfile = VALID_VOICE_PROFILES.has(mappedVoice) ? mappedVoice : 'kronos';
  const mappedMove = LEGACY_CUSTOM_MOVEMENT[input.movement] || input.movement;
  const movement = VALID_MOVEMENT_ARCHETYPES.has(mappedMove) ? mappedMove : 'stride';
  const mappedReact = LEGACY_CUSTOM_REACTION[input.reactionStyle] || input.reactionStyle;
  const reactionStyle = VALID_REACTION_STYLES.has(mappedReact) ? mappedReact : 'sparks';
  const mappedSound = LEGACY_CUSTOM_SOUND[input.soundPack] || input.soundPack;
  const soundPack = VALID_SOUND_PACKS.has(mappedSound) ? mappedSound : 'ambient';

  const rawSize = Number(input.size);
  const size = Number.isFinite(rawSize) ? Math.max(0.72, Math.min(1.4, Math.round(rawSize * 100) / 100)) : 1.05;

  const rawSpeed = Number(input.speed);
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.6, Math.min(1.6, Math.round(rawSpeed * 100) / 100)) : 1.0;

  const artCheck = validateArtworkDataUrl(input.artworkDataUrl || '');
  if (!artCheck.ok) return { ok: false, error: artCheck.error };

  const id = existingId && /^custom-[a-z0-9_-]{4,32}$/i.test(existingId)
    ? existingId.toLowerCase()
    : `custom-${crypto.randomBytes(4).toString('hex')}`;

  const now = Date.now();
  return {
    ok: true,
    hero: {
      id,
      isCustom: true,
      category,
      name,
      nickname,
      title,
      template: artCheck.value ? 'custom-art' : template,
      artworkDataUrl: artCheck.value,
      primaryColor,
      secondaryColor,
      accentColor,
      theme,
      personality,
      voiceProfile,
      movement,
      reactionStyle,
      soundPack,
      size,
      speed,
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : now,
      updatedAt: now,
    },
  };
}

/**
 * Local-first Custom Hero Store.
 * Stores all user-created companions & uploaded artwork strictly in
 * %LOCALAPPDATA%\PetFish\custom-heroes\heroes.json (never uploaded externally, never in Git).
 */
class CustomHeroStore {
  constructor(customBaseDir = null) {
    const base = customBaseDir || path.join(getPrivateDataDir(), 'custom-heroes');
    this.dir = base;
    this.file = path.join(this.dir, 'heroes.json');
    this.heroes = [];
    this.load();
  }

  load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (Array.isArray(parsed)) {
          const clean = [];
          for (const item of parsed.slice(0, MAX_CUSTOM_HEROES)) {
            const v = validateCustomHeroInput(item, item?.id);
            if (v.ok) clean.push(v.hero);
          }
          this.heroes = clean;
        }
      }
    } catch (e) {
      writeLog('WARN', `CustomHeroStore load failed: ${e.message}`);
      this.heroes = [];
    }
  }

  save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.heroes, null, 2), 'utf8');
      return true;
    } catch (e) {
      writeLog('WARN', `CustomHeroStore save failed: ${e.message}`);
      return false;
    }
  }

  list() {
    return this.heroes.map((h) => ({ ...h }));
  }

  get(id) {
    return this.heroes.find((h) => h.id === id) || null;
  }

  create(payload) {
    if (this.heroes.length >= MAX_CUSTOM_HEROES) {
      return { ok: false, error: `Maximum of ${MAX_CUSTOM_HEROES} custom heroes reached.` };
    }
    const v = validateCustomHeroInput(payload);
    if (!v.ok) return v;
    this.heroes.push(v.hero);
    this.save();
    return { ok: true, hero: v.hero, heroes: this.list() };
  }

  update(id, patch) {
    const idx = this.heroes.findIndex((h) => h.id === id);
    if (idx < 0) return { ok: false, error: 'Custom hero not found.' };
    const merged = { ...this.heroes[idx], ...(patch || {}), createdAt: this.heroes[idx].createdAt };
    const v = validateCustomHeroInput(merged, id);
    if (!v.ok) return v;
    this.heroes[idx] = v.hero;
    this.save();
    return { ok: true, hero: v.hero, heroes: this.list() };
  }

  rename(id, name, nickname) {
    const existing = this.get(id);
    if (!existing) return { ok: false, error: 'Custom hero not found.' };
    return this.update(id, {
      name: name ?? existing.name,
      nickname: nickname ?? name ?? existing.nickname,
    });
  }

  duplicate(id) {
    const existing = this.get(id);
    if (!existing) return { ok: false, error: 'Custom hero not found.' };
    const copyName = `${existing.name.slice(0, 22)} Copy`;
    return this.create({
      ...existing,
      id: undefined,
      name: copyName,
      nickname: copyName,
      createdAt: Date.now(),
    });
  }

  delete(id) {
    const before = this.heroes.length;
    this.heroes = this.heroes.filter((h) => h.id !== id);
    if (this.heroes.length === before) return { ok: false, error: 'Custom hero not found.' };
    this.save();
    return { ok: true, heroes: this.list() };
  }

  exportHero(id) {
    const existing = this.get(id);
    if (!existing) return { ok: false, error: 'Custom hero not found.' };
    return {
      ok: true,
      json: JSON.stringify(
        {
          schema: 'ov-custom-hero-v1',
          exportedAt: new Date().toISOString(),
          hero: {
            name: existing.name,
            nickname: existing.nickname,
            title: existing.title,
            template: existing.template,
            artworkDataUrl: existing.artworkDataUrl,
            primaryColor: existing.primaryColor,
            secondaryColor: existing.secondaryColor,
            accentColor: existing.accentColor,
            theme: existing.theme,
            personality: existing.personality,
            voiceProfile: existing.voiceProfile,
            movement: existing.movement,
            reactionStyle: existing.reactionStyle,
            soundPack: existing.soundPack,
            size: existing.size,
            speed: existing.speed,
          },
        },
        null,
        2
      ),
    };
  }

  importHero(rawJsonOrObj) {
    if (this.heroes.length >= MAX_CUSTOM_HEROES) {
      return { ok: false, error: `Maximum of ${MAX_CUSTOM_HEROES} custom heroes reached.` };
    }
    let parsed = rawJsonOrObj;
    if (typeof rawJsonOrObj === 'string') {
      if (rawJsonOrObj.length > MAX_ARTWORK_BYTES * 2) {
        return { ok: false, error: 'Import payload is too large.' };
      }
      try {
        parsed = JSON.parse(rawJsonOrObj);
      } catch {
        return { ok: false, error: 'Invalid JSON syntax in imported hero file.' };
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Invalid hero configuration.' };
    }
    if (parsed.schema && parsed.schema !== 'ov-custom-hero-v1' && parsed.schema !== 'ov-custom-companion-v1') {
      return { ok: false, error: `Unsupported companion schema: ${String(parsed.schema).slice(0, 32)}` };
    }
    const heroData = parsed.hero && typeof parsed.hero === 'object' ? parsed.hero : parsed;
    return this.create({ ...heroData, id: undefined });
  }
}

module.exports = {
  CustomHeroStore,
  validateCustomHeroInput,
  validateArtworkDataUrl,
  MAX_CUSTOM_HEROES,
  MAX_ARTWORK_BYTES,
};
