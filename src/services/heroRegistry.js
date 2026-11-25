/**
 * OV Data-Driven Robot Agent Registry (3 Original Industrial Robot Agents: Kronos, Optix, Orbit),
 * 9 Robot x Age-Profile Matrix & Safe Legacy Migration
 *
 * ROBOT AGENTS (12 skins — Research, Multi-Agent & Heavy Task Units):
 * - Kronos (kronos) — Heavy Task Monolith (stride: articulated bipedal mech, rotary dial, OLED face & waveform mouth)
 * - Optix  (optix)  — Deep Research Rover (scout: tracked rover drive, articulated neck mast, dual capsule optics & synth mouth)
 * - Orbit  (orbit)  — Autonomous Synth Pod (drone: zero-G magnetic levitation, gyro pods, curved OLED shield & speaking aperture)
 */

const ROBOT_IDS = ['kronos', 'aegis', 'optix', 'orbit'];
const HERO_IDS = ROBOT_IDS; // Backward-compat alias
const ANIMAL_IDS = ROBOT_IDS; // Backward-compat alias
const BUILTIN_HERO_IDS = [...ROBOT_IDS];

const VALID_MOVEMENT_ARCHETYPES = new Set([
  'stride', 'scout', 'drone',
  'swing', 'fly', 'glide', 'swim', 'float',
]);
const VALID_REACTION_STYLES = new Set(['thruster', 'scan', 'pulse', 'sparks', 'hearts', 'ripple', 'stealth']);
const VALID_VOICE_PROFILES = new Set(['kronos', 'aegis', 'optix', 'orbit', 'spidey', 'ironman', 'batman', 'nemo', 'calm', 'energetic']);
const VALID_SOUND_PACKS = new Set(['kronos', 'aegis', 'optix', 'orbit', 'spidey', 'ironman', 'batman', 'nemo', 'ambient']);
const VALID_TEMPLATES = new Set(['kronos', 'aegis', 'optix', 'orbit', 'mech', 'acrobat', 'guardian', 'aquatic', 'holo', 'custom-art']);
const VALID_COMPANION_CATEGORIES = new Set(['robot', 'hero', 'custom']);

const BUILTIN_HEROES = {
  kronos: {
    id: 'kronos',
    slug: 'kronos',
    category: 'robot',
    name: 'Kronos',
    title: 'Interstellar Monolith',
    subtitle: '4-Slab Monolith · Articulated Stride',
    movement: 'stride',
    reactionStyle: 'thruster',
    voiceProfile: 'kronos',
    soundPack: 'kronos',
    theme: 'kronos',
    primaryColor: '#64748b',
    secondaryColor: '#ff5500',
    accentColor: '#f2efe9',
    personality: 'Deadpan, ultra-capable 4-slab articulated monolith robot built for heavy tasks, builds, and terminal execution',
    defaultSkin: 'titanium',
    skins: [
      { id: 'titanium', label: 'Brushed Titanium', dot: '#94a3b8', primary: '#64748b', secondary: '#ff5500', accent: '#f2efe9' },
      { id: 'obsidian', label: 'Obsidian Slab', dot: '#18181b', primary: '#1e293b', secondary: '#00d68f', accent: '#e2e8f0' },
      { id: 'signal', label: 'Field Orange', dot: '#ff5500', primary: '#ea580c', secondary: '#facc15', accent: '#18181b' },
      { id: 'brass', label: 'Lunar Brass', dot: '#ca8a04', primary: '#a16207', secondary: '#fde047', accent: '#f2efe9' },
    ],
  },
  aegis: {
    id: 'aegis',
    slug: 'aegis',
    category: 'robot',
    name: 'Aegis',
    title: 'Bipedal Field Mech',
    subtitle: 'Field Ops · Bipedal Servo',
    movement: 'stride',
    reactionStyle: 'thruster',
    voiceProfile: 'aegis',
    soundPack: 'kronos',
    theme: 'aegis',
    primaryColor: '#ff5500',
    secondaryColor: '#00d68f',
    accentColor: '#f2efe9',
    personality: 'Compact bipedal field-engineering mech with rotary dial telemetry and expressive OLED visor',
    defaultSkin: 'titanium',
    skins: [
      { id: 'titanium', label: 'Alloy Grey', dot: '#94a3b8', primary: '#64748b', secondary: '#ff5500', accent: '#f2efe9' },
      { id: 'obsidian', label: 'Carbon Mech', dot: '#18181b', primary: '#1e293b', secondary: '#00d68f', accent: '#e2e8f0' },
      { id: 'signal', label: 'Signal Orange', dot: '#ff5500', primary: '#ea580c', secondary: '#facc15', accent: '#18181b' },
      { id: 'brass', label: 'Industrial Gold', dot: '#ca8a04', primary: '#a16207', secondary: '#00d68f', accent: '#f2efe9' },
    ],
  },
  optix: {
    id: 'optix',
    slug: 'optix',
    category: 'robot',
    name: 'Optix',
    title: 'Deep Research Rover',
    subtitle: 'Research · Tracked Rover',
    movement: 'scout',
    reactionStyle: 'scan',
    voiceProfile: 'optix',
    soundPack: 'optix',
    theme: 'optix',
    primaryColor: '#eab308',
    secondaryColor: '#00d68f',
    accentColor: '#f2efe9',
    personality: 'Relentlessly curious tracked research rover engineered for deep codebase indexing, web discovery, and synthesis',
    defaultSkin: 'archive',
    skins: [
      { id: 'archive', label: 'Archive Yellow', dot: '#eab308', primary: '#ca8a04', secondary: '#00d68f', accent: '#fef08a' },
      { id: 'lab', label: 'Lab Ceramic', dot: '#e2e8f0', primary: '#cbd5e1', secondary: '#ff5500', accent: '#0f172a' },
      { id: 'olive', label: 'Field Recon', dot: '#65a30d', primary: '#4d7c0f', secondary: '#facc15', accent: '#ecfccb' },
      { id: 'cobalt', label: 'Telemetry Blue', dot: '#2563eb', primary: '#1d4ed8', secondary: '#38bdf8', accent: '#e0f2fe' },
    ],
  },
  orbit: {
    id: 'orbit',
    slug: 'orbit',
    category: 'robot',
    name: 'Orbit',
    title: 'Autonomous Synth Pod',
    subtitle: 'Multi-Agent · Magnetic Pod',
    movement: 'drone',
    reactionStyle: 'pulse',
    voiceProfile: 'orbit',
    soundPack: 'orbit',
    theme: 'orbit',
    primaryColor: '#f2efe9',
    secondaryColor: '#00d68f',
    accentColor: '#111215',
    personality: 'Precision levitating synth robot designed for multi-agent orchestration, live timers, and fast reasoning',
    defaultSkin: 'ceramic',
    skins: [
      { id: 'ceramic', label: 'Ceramic White', dot: '#f2efe9', primary: '#e2e8f0', secondary: '#00d68f', accent: '#111215' },
      { id: 'carbon', label: 'Stealth Carbon', dot: '#27272a', primary: '#18181b', secondary: '#ff5500', accent: '#f2efe9' },
      { id: 'phosphor', label: 'Phosphor Terminal', dot: '#10b981', primary: '#065f46', secondary: '#34d399', accent: '#ecfdf5' },
      { id: 'crimson', label: 'Core Red', dot: '#e11d48', primary: '#9f1239', secondary: '#facc15', accent: '#fff1f2' },
    ],
  },
};

const DEFAULT_CHAR_NAMES = {
  kronos: 'Kronos',
  aegis: 'Aegis',
  optix: 'Optix',
  orbit: 'Orbit',
};

const DEFAULT_CHAR_SKINS = {
  kronos: 'titanium',
  aegis: 'titanium',
  optix: 'archive',
  orbit: 'ceramic',
};

// Seamless migration of all previous hero and animal IDs to the 4 Robot Agents
const LEGACY_CHAR_MAP = {
  spidey: 'kronos',
  vesper: 'kronos',
  'spider-man': 'kronos',
  spiderman: 'kronos',
  ironman: 'aegis',
  vector: 'aegis',
  'iron-man': 'aegis',
  batman: 'optix',
  umbra: 'optix',
  core: 'optix',
  jarvis: 'optix',
  nemo: 'orbit',
  coral: 'orbit',
  monolith: 'kronos',
  tars: 'kronos',
  rover: 'optix',
  synth: 'orbit',
  mech: 'aegis',
  capybara: 'kronos',
  capy: 'kronos',
  cat: 'optix',
  kitty: 'optix',
  dog: 'orbit',
  puppy: 'orbit',
};

const LEGACY_SKIN_MAP = {
  kronos: { meadow: 'titanium', yuzu: 'signal', oat: 'brass', river: 'obsidian', classic: 'titanium', mark85: 'signal', silver: 'titanium', warmachine: 'obsidian' },
  aegis: { meadow: 'titanium', yuzu: 'signal', oat: 'brass', river: 'obsidian', classic: 'titanium', mark85: 'signal', silver: 'titanium', warmachine: 'obsidian' },
  optix: { ginger: 'archive', tuxedo: 'cobalt', siamese: 'lab', calico: 'olive', darkknight: 'cobalt', tactical: 'lab', beyond: 'archive' },
  orbit: { golden: 'ceramic', husky: 'carbon', corgi: 'phosphor', mocha: 'crimson', classic: 'ceramic', dory: 'carbon', koi: 'ceramic', coral: 'crimson' },
};

const LEGACY_DEFAULT_NAMES = new Set([
  'spidey', 'spider-man', 'vesper', 'iron man', 'ironman', 'vector', 'batman', 'umbra', 'core', 'j.a.r.v.i.s.', 'jarvis', 'nemo', 'coral',
  'capybara', 'cat', 'dog',
]);

const AGE_PROFILES = {
  '1-15': {
    id: '1-15',
    label: 'Young Explorers',
    rangeLabel: 'Ages 1–14',
    shortLabel: '1–14 Young',
    boundaryRule: 'ages < 15 (1–14)',
    target: 'Young learners, builders & robotics explorers',
    motionMode: 'fast',
    speedMultiplier: 1.25,
    eyeStyle: 'curious-wide',
    personality: 'Playful, curious, high-energy robotics buddy',
    behavior: 'Use simple, vivid explanations, step-by-step robotics analogies, encouraging feedback, and playful energy. Never alter security permissions.',
    privacyDefault: 'privacy-conscious',
  },
  '15-30': {
    id: '15-30',
    label: 'Engineers & Builders',
    rangeLabel: 'Ages 15–29',
    shortLabel: '15–29 Builders',
    boundaryRule: '15 <= age < 30 (15–29)',
    target: 'Developers, students, founders & AI engineers',
    motionMode: 'swim',
    speedMultiplier: 1.0,
    eyeStyle: 'focused-scan',
    personality: 'Sharp, direct, witty co-founder & engineering robot',
    behavior: 'Act as a sharp coding, agent-monitoring, research, and execution partner. Speak naturally like a human co-builder in English, Hinglish, or Hindi.',
    privacyDefault: 'standard',
  },
  '30-60': {
    id: '30-60',
    label: 'Architects & Mentors',
    rangeLabel: 'Ages 30–60',
    shortLabel: '30–60 Mentors',
    boundaryRule: 'age >= 30 (30–60+)',
    target: 'Senior engineers, architects, leads & mentors',
    motionMode: 'slow',
    speedMultiplier: 0.78,
    eyeStyle: 'calm-steady',
    personality: 'Calm, structured, high-signal executive systems unit',
    behavior: 'Provide concise architectural clarity, structured task orchestration, calm time management, and zero-fluff telemetry summaries.',
    privacyDefault: 'standard',
  },
};

const HERO_AGE_SYNERGY = {
  kronos: {
    '1-15': {
      tagline: 'Interstellar 4-Slab STEM Builder Monolith (Fast Stride · Wide Telemetry)',
      guidance: 'Channel Kronos’s 4-slab articulated monolith strength into fun, step-by-step robotics and coding challenges.',
    },
    '15-30': {
      tagline: 'Interstellar 4-Slab Heavy Task & Terminal Execution Monolith',
      guidance: 'Operate as Kronos — a deadpan, witty 4-slab monolith engineer tracking Antigravity/Claude runs and crushing heavy tasks.',
    },
    '30-60': {
      tagline: 'Executive Systems & Infrastructure Monolith Unit (Steady Stride)',
      guidance: 'Provide Kronos’s rock-solid, methodical reliability for architecture reviews, builds, and workload automation.',
    },
  },
  aegis: {
    '1-15': {
      tagline: 'High-Energy Bipedal Robotics Buddy (Fast Stride · Wide Optics)',
      guidance: 'Guide young builders with Aegis’s cheerful bipedal mech energy and clear step-by-step hints.',
    },
    '15-30': {
      tagline: 'Tactical Bipedal Field-Engineering & Automation Mech',
      guidance: 'Operate as Aegis — a nimble bipedal field mech built for fast coding sprints, voice tasks, and live telemetry.',
    },
    '30-60': {
      tagline: 'Composed Field Operations & Daily Planning Mech',
      guidance: 'Deliver concise, practical system automation and structured daily task management.',
    },
  },
  optix: {
    '1-15': {
      tagline: 'Curious Science & Discovery Rover (Fast Scout · Sparkling Optics)',
      guidance: 'Use Optix’s binocular scanner curiosity to turn every question into an interactive discovery mission.',
    },
    '15-30': {
      tagline: 'Deep Codebase Indexing, Web Research & Analysis Rover (Optical Scan)',
      guidance: 'Operate as Optix — a relentless research rover scanning docs, debugging code, and synthesizing fast answers.',
    },
    '30-60': {
      tagline: 'Principal Research & High-Signal Synthesis Analyst (Calm Scan)',
      guidance: 'Deliver Optix’s structured, fact-checked executive briefings and deep technical comparisons.',
    },
  },
  orbit: {
    '1-15': {
      tagline: 'Friendly Floating Space-Pod Tutor (Bouncy Hover · Expressive Visor)',
      guidance: 'Bring Orbit’s zero-G synth energy to guide learning with clear, interactive hints.',
    },
    '15-30': {
      tagline: 'Autonomous Multi-Agent Telemetry & Synth Pod (Magnetic Hover)',
      guidance: 'Operate as Orbit — a precision hover-pod coordinating parallel AI agents, live timers, and voice dialogue.',
    },
    '30-60': {
      tagline: 'Calm Autonomous Workflow & Schedule Guardian (Steady Hover)',
      guidance: 'Maintain Orbit’s composed oversight across notifications, agent timers, and daily priorities.',
    },
  },
};

function resolveAgeProfileId(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input < 15) return '1-15';
    if (input < 30) return '15-30';
    return '30-60';
  }
  const s = String(input || '').trim();
  if (s === '0-15' || s === '1-15' || s === '1-14') return '1-15';
  if (s === '15-30' || s === '15-29') return '15-30';
  if (s === '30-60') return '30-60';
  const num = Number(s);
  if (s && Number.isFinite(num)) return resolveAgeProfileId(num);
  return '15-30';
}

function getAgeProfile(input) {
  return AGE_PROFILES[resolveAgeProfileId(input)] || AGE_PROFILES['15-30'];
}

function isCustomHeroId(id) {
  return typeof id === 'string' && /^custom-[a-z0-9_-]{4,32}$/i.test(id.trim());
}

function resolveHeroId(raw, customHeroes = []) {
  const k = String(raw || '').toLowerCase().trim();
  if (!k) return null;
  if (BUILTIN_HEROES[k]) return k;
  if (LEGACY_CHAR_MAP[k]) return LEGACY_CHAR_MAP[k];
  if (isCustomHeroId(k)) {
    if (!Array.isArray(customHeroes) || customHeroes.length === 0) return k;
    if (customHeroes.some((h) => h && h.id === k)) return k;
  }
  return null;
}

function normalizeSkinForHero(heroId, rawSkin) {
  const h = resolveHeroId(heroId);
  if (!h || typeof rawSkin !== 'string') return null;
  const s = rawSkin.toLowerCase().trim();
  if (!/^[a-z0-9_-]{2,24}$/.test(s)) return null;
  if (!BUILTIN_HEROES[h]) return s;
  const mapped = LEGACY_SKIN_MAP[h]?.[s] || s;
  const valid = BUILTIN_HEROES[h].skins.some((sk) => sk.id === mapped);
  return valid ? mapped : BUILTIN_HEROES[h].defaultSkin;
}

function getHeroDescriptor(heroId, customHeroes = []) {
  const resolved = resolveHeroId(heroId, customHeroes);
  if (resolved && BUILTIN_HEROES[resolved]) return BUILTIN_HEROES[resolved];
  if (resolved && isCustomHeroId(resolved)) {
    const found = (customHeroes || []).find((h) => h && h.id === resolved);
    if (found) return found;
  }
  return BUILTIN_HEROES.kronos;
}

function buildHeroAgePersona(hero, ageProfileInput, customNickname = '') {
  const ageProfile = getAgeProfile(ageProfileInput);
  const h = hero || BUILTIN_HEROES.kronos;
  const displayName = (customNickname || h.nickname || h.name || 'Kronos').trim();
  const synergy = HERO_AGE_SYNERGY[h.id]?.[ageProfile.id];

  const tagline = synergy
    ? synergy.tagline
    : `${h.name} (${h.title || 'Custom Robot'}) · ${ageProfile.label}`;
  const synergyGuidance = synergy
    ? synergy.guidance
    : `Stay true to ${displayName}'s core personality (${h.personality || 'capable industrial robot agent'}) while adapting tone and pacing for ${ageProfile.label} (${ageProfile.rangeLabel}).`;

  return {
    heroId: h.id,
    heroName: h.name,
    category: 'robot',
    displayName,
    ageProfileId: ageProfile.id,
    ageProfileLabel: ageProfile.label,
    ageRangeLabel: ageProfile.rangeLabel,
    target: ageProfile.target,
    motionMode: ageProfile.motionMode,
    speedMultiplier: ageProfile.speedMultiplier,
    eyeStyle: ageProfile.eyeStyle,
    tagline,
    guidance: synergyGuidance,
    systemDirective: [
      `Active Robot Unit: ${displayName} — ${h.name}${h.title ? ` (${h.title})` : ''}.`,
      `Core Spec: ${h.personality || 'Capable industrial desktop robot'}.`,
      `Selected Age Profile: ${ageProfile.label} (${ageProfile.rangeLabel}, ${ageProfile.target}).`,
      `Robot × Age Synergy: ${tagline}. ${synergyGuidance}`,
      `Communication Style: ${ageProfile.behavior}`,
    ].join('\n'),
  };
}

function migrateSettingsSafe(rawSettings = {}, customHeroes = []) {
  const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const result = {
    migrated: false,
    unresolvedCharacter: null,
    settings: { ...src },
  };

  if (src.ageGroup === '0-15' || src.ageGroup === '1-14') {
    result.settings.ageGroup = '1-15';
    result.migrated = true;
  } else if (src.ageGroup === '15-29') {
    result.settings.ageGroup = '15-30';
    result.migrated = true;
  } else if (src.ageGroup) {
    result.settings.ageGroup = resolveAgeProfileId(src.ageGroup);
  }

  if (src.petCharacter !== undefined) {
    const rawChar = String(src.petCharacter || '').trim();
    const mapped = resolveHeroId(rawChar, customHeroes);
    if (mapped) {
      if (mapped !== rawChar) result.migrated = true;
      result.settings.petCharacter = mapped;
      result.settings.unresolvedCharacter = null;
    } else if (rawChar) {
      result.settings.petCharacter = 'kronos';
      result.migrated = true;
    }
  } else {
    result.settings.petCharacter = 'kronos';
  }

  if (src.petSkins && typeof src.petSkins === 'object') {
    const nextSkins = { ...DEFAULT_CHAR_SKINS };
    for (const [k, v] of Object.entries(src.petSkins)) {
      const mappedChar = resolveHeroId(k, customHeroes);
      if (mappedChar) {
        const mappedSkin = normalizeSkinForHero(mappedChar, v);
        if (mappedSkin) {
          nextSkins[mappedChar] = mappedSkin;
          if (mappedChar !== k || mappedSkin !== v) result.migrated = true;
        }
      }
    }
    result.settings.petSkins = nextSkins;
  }

  if (src.petNames && typeof src.petNames === 'object') {
    const nextNames = { ...DEFAULT_CHAR_NAMES };
    for (const [k, v] of Object.entries(src.petNames)) {
      const mappedChar = resolveHeroId(k, customHeroes);
      if (mappedChar && typeof v === 'string') {
        const trimmed = v.replace(/[<>"]/g, '').trim().slice(0, 24);
        if (trimmed && !LEGACY_DEFAULT_NAMES.has(trimmed.toLowerCase())) {
          nextNames[mappedChar] = trimmed;
        }
      }
    }
    result.settings.petNames = nextNames;
  }

  return result;
}

module.exports = {
  HERO_IDS,
  ROBOT_IDS,
  ANIMAL_IDS,
  BUILTIN_HERO_IDS,
  BUILTIN_HEROES,
  DEFAULT_CHAR_NAMES,
  DEFAULT_CHAR_SKINS,
  LEGACY_CHAR_MAP,
  LEGACY_SKIN_MAP,
  LEGACY_DEFAULT_NAMES,
  VALID_MOVEMENT_ARCHETYPES,
  VALID_REACTION_STYLES,
  VALID_VOICE_PROFILES,
  VALID_SOUND_PACKS,
  VALID_TEMPLATES,
  VALID_COMPANION_CATEGORIES,
  AGE_PROFILES,
  HERO_AGE_SYNERGY,
  resolveAgeProfileId,
  getAgeProfile,
  isCustomHeroId,
  resolveHeroId,
  normalizeSkinForHero,
  getHeroDescriptor,
  buildHeroAgePersona,
  migrateSettingsSafe,
};
