/**
 * OV 60 FPS Industrial Robot Companion Canvas Engine
 * Inspired by Living.ai EMO, Anki Vector, Energize Lab Eilik & Teenage Engineering Hardware.
 *
 * Units:
 * 1. KRONOS — Heavy Task Monolith Mech (Bipedal servo legs, rotary chest dial, OLED face & waveform mouth)
 * 2. OPTIX  — Deep Research Rover (Caterpillar treads, articulated neck mast, dual capsule optics & synth mouth)
 * 3. ORBIT  — Autonomous Synth Pod (Zero-G levitating capsule, magnetic side pods, curved OLED shield & speaking mouth)
 *
 * Features:
 * - Zero muddy gradients & zero system emojis (100% flat cel-shaded vector hardware plates)
 * - Live Top-of-Head Agent Timer Badge ([ANTIGRAVITY // MM:SS] + START HH:MM)
 * - Animated Moving Mouth synchronized with Neural TTS & Chat replies
 * - Hardware Studio Headphones (Music/Video), Task Data Slate (Agent Working), and Simultaneous Multitask Mode
 */
(function () {
  const api = window.petFishAPI;
  const canvas = document.getElementById('fish-canvas');
  const ctx = canvas.getContext('2d');

  const W = 204;
  const H = 196;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(DPR, DPR);

  const KRONOS_SKINS = {
    titanium: { body: '#8b95a5', bodyHi: '#cbd5e1', bodyShade: '#475569', dark: '#131519', screen: '#07080a', led: '#ff5500', accent: '#f2efe9' },
    obsidian: { body: '#22262e', bodyHi: '#3f4654', bodyShade: '#111318', dark: '#090a0d', screen: '#050608', led: '#00d68f', accent: '#e2e8f0' },
    signal:   { body: '#ff5500', bodyHi: '#ff7833', bodyShade: '#b83b00', dark: '#141518', screen: '#07080a', led: '#facc15', accent: '#f2efe9' },
    brass:    { body: '#c28e26', bodyHi: '#e6b84d', bodyShade: '#7d5911', dark: '#141518', screen: '#07080a', led: '#00d68f', accent: '#f2efe9' },
  };

  const OPTIX_SKINS = {
    archive: { body: '#eab308', bodyHi: '#fde047', bodyShade: '#a16207', head: '#f2efe9', screen: '#07080a', led: '#00d68f', tread: '#181a20' },
    lab:     { body: '#d8dee9', bodyHi: '#f8fafc', bodyShade: '#94a3b8', head: '#ffffff', screen: '#07080a', led: '#ff5500', tread: '#181a20' },
    olive:   { body: '#65a30d', bodyHi: '#a3e635', bodyShade: '#3f6212', head: '#e2e8f0', screen: '#07080a', led: '#facc15', tread: '#14161b' },
    cobalt:  { body: '#2563eb', bodyHi: '#60a5fa', bodyShade: '#1e3a8a', head: '#e2e8f0', screen: '#07080a', led: '#38bdf8', tread: '#14161b' },
  };

  const ORBIT_SKINS = {
    ceramic:  { body: '#e6e4de', bodyHi: '#ffffff', bodyShade: '#b8b4aa', dark: '#15171c', screen: '#07080a', led: '#00d68f', ring: '#ff5500' },
    carbon:   { body: '#23262e', bodyHi: '#3b404d', bodyShade: '#13151a', dark: '#090a0d', screen: '#050608', led: '#ff5500', ring: '#00d68f' },
    phosphor: { body: '#0d4a3a', bodyHi: '#157359', bodyShade: '#062920', dark: '#090b0e', screen: '#050806', led: '#34d399', ring: '#a7f3d0' },
    crimson:  { body: '#be123c', bodyHi: '#f43f5e', bodyShade: '#881337', dark: '#111216', screen: '#07080a', led: '#facc15', ring: '#fda4af' },
  };

  const st = {
    character: 'kronos',
    movementArchetype: 'stride',
    customHero: null,
    skin: 'titanium',
    ageGroup: '15-30',
    vx: 0,
    vy: 0,
    speed: 0,
    facing: 1,
    pitch: 0,
    mode: 'swim',
    animalState: 'walking',
    stretchX: 0,
    stretchY: 0,
    squishMag: 0,
    scale: 1.06,
    hudOpen: false,
    isDragging: false,
    isThinking: false,
    approvals: 0,
    unread: 0,
    unreadWA: 0,
    musicPlaying: false,
    danceModeEnabled: false,
    isListening: false,
    agentWorking: false,
    activeTaskLabel: '',
    activeAgentName: '',
    activeAgentWhat: '',
    activeAgentStartStr: '',
    agentElapsedSec: 0,
    isSpeaking: false,
    speechSnippet: '',
  };

  let cachedArtUrl = '';
  let cachedArtImg = null;
  function getCustomArtImage(url) {
    if (!url) { cachedArtUrl = ''; cachedArtImg = null; return null; }
    if (url === cachedArtUrl && cachedArtImg) return cachedArtImg;
    cachedArtUrl = url;
    const img = new Image();
    img.src = url;
    cachedArtImg = img;
    return img;
  }

  let t = 0;
  let lastTs = performance.now();
  let blinkTimer = 2.4;
  let blinkAmount = 0;
  let happyTimer = 0;
  let alertPulse = 0;
  let forceDanceTimer = 0;
  let forceTaskTimer = 0;
  let speakTimer = 0;

  const particles = [];

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function formatDurationMMSS(totalSec) {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function spawnParticles(x, y, count = 4, kind = 'spark', color = '#ff5500') {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 16 + Math.random() * 34;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 14,
        size: 2.2 + Math.random() * 2,
        life: 1,
        decay: 1.1 + Math.random() * 0.7,
        kind,
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#090a0d';
      ctx.lineWidth = 1;
      // Crisp geometric pixel square particles (zero blurry circles)
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      ctx.strokeRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      ctx.restore();
    }
  }

  // =========================================================================
  // EXPRESSIVE OLED ROBOT FACE SCREEN (EYES + MOVING SPEAKING MOUTH)
  // Inspired by EMO, Anki Vector & Eilik OLED facial animation
  // =========================================================================
  function drawOledFaceContents(cx, cy, w, h, ledColor, s) {
    const isSpeakingNow = Boolean(st.isSpeaking || speakTimer > 0 || (window.auraSound && window.auraSound.isSpeaking && window.auraSound.isSpeaking()));
    const isMusic = Boolean(st.danceModeEnabled || forceDanceTimer > 0);
    const isWorking = Boolean(st.agentWorking || st.isThinking || forceTaskTimer > 0);
    const isYoung = st.ageGroup === '1-15';
    const isMentor = st.ageGroup === '30-60';

    const eyeY = cy - h * 0.14;
    const eyeSpread = w * 0.25;
    const scanShift = isWorking ? Math.sin(t * 5.5) * 2.2 * s : 0;
    const baseEyeW = (isYoung ? 5.6 : 4.8) * s;
    const baseEyeH = (isYoung ? 6.2 : isMentor ? 4.2 : 5.2) * s * (1 - blinkAmount * 0.88);

    ctx.save();
    ctx.fillStyle = ledColor;
    ctx.strokeStyle = ledColor;

    // 1. EYES
    if (isMusic && !isWorking) {
      // Happy rhythmic curved eyes (^ ^)
      ctx.lineWidth = 2.2 * s;
      ctx.lineCap = 'square';
      for (const side of [-1, 1]) {
        const ex = cx + side * eyeSpread;
        ctx.beginPath();
        ctx.moveTo(ex - 4 * s, eyeY + 1.5 * s);
        ctx.lineTo(ex, eyeY - 2.8 * s);
        ctx.lineTo(ex + 4 * s, eyeY + 1.5 * s);
        ctx.stroke();
      }
    } else {
      for (const side of [-1, 1]) {
        const ex = cx + side * eyeSpread + scanShift;
        ctx.beginPath();
        ctx.roundRect(ex - baseEyeW * 0.5, eyeY - baseEyeH * 0.5, baseEyeW, Math.max(1.2 * s, baseEyeH), 1.4 * s);
        ctx.fill();

        // Focused brow cut when working or young sparkle pixel
        if (isYoung && blinkAmount < 0.3) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(ex + 0.8 * s, eyeY - baseEyeH * 0.35, 1.5 * s, 1.5 * s);
          ctx.fillStyle = ledColor;
        }
      }
    }

    // 2. MOVING MOUTH (animates dynamically when talking with the user!)
    const mouthY = cy + h * 0.27;
    if (isSpeakingNow) {
      // Multi-segment animated speaking mouth + vowel aperture
      const talkOpen = (2.0 + Math.abs(Math.sin(t * 24)) * 4.5 + Math.abs(Math.cos(t * 37)) * 1.8) * s;
      const mouthW = (7.5 + Math.sin(t * 19) * 2.2) * s;
      ctx.fillStyle = ledColor;
      ctx.beginPath();
      ctx.roundRect(cx - mouthW * 0.5, mouthY - talkOpen * 0.5, mouthW, talkOpen, 1.4 * s);
      ctx.fill();

      // Inner dark mouth cavity when wide open
      if (talkOpen > 3.8 * s) {
        ctx.fillStyle = '#07080a';
        ctx.fillRect(cx - mouthW * 0.3, mouthY - talkOpen * 0.22, mouthW * 0.6, talkOpen * 0.44);
      }

      // Flanking micro voice waveform bars
      ctx.fillStyle = '#ff5500';
      for (const side of [-1, 1]) {
        const bh = (1.6 + Math.abs(Math.sin(t * 28 + side * 1.7)) * 3.4) * s;
        ctx.fillRect(cx + side * (mouthW * 0.5 + 2.4 * s) - 0.8 * s, mouthY - bh * 0.5, 1.6 * s, bh);
      }
    } else if (isMusic) {
      // Subtle rhythmic beat smile bar
      const smileW = (6 + Math.abs(Math.sin(t * 12)) * 2.5) * s;
      ctx.fillStyle = ledColor;
      ctx.fillRect(cx - smileW * 0.5, mouthY - 0.9 * s, smileW, 1.8 * s);
    } else if (isWorking) {
      // Concentration telemetry micro-dots
      const activeDot = Math.floor(t * 6) % 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === activeDot ? '#ff5500' : ledColor;
        ctx.fillRect(cx + (i - 1) * 3.6 * s - 1 * s, mouthY - 1 * s, 2 * s, 2 * s);
      }
    } else {
      // Idle friendly hardware mouth line
      ctx.fillStyle = ledColor;
      ctx.fillRect(cx - 3.5 * s, mouthY - 0.8 * s, 7 * s, 1.6 * s);
    }

    ctx.restore();
  }

  // =========================================================================
  // 1. KRONOS — Interstellar 4-Slab Articulated Monolith Robot (TARS / CASE Inspired)
  // Four independent articulated titanium monolith slabs with recessed OLED visor & moving mouth!
  // =========================================================================
  function drawKronos(cx, cy, customPal = null) {
    const pal = customPal || KRONOS_SKINS[st.skin] || KRONOS_SKINS.titanium;
    const s = st.scale;
    const isMusic = Boolean(st.danceModeEnabled || forceDanceTimer > 0);
    const isWorking = Boolean(st.agentWorking || st.isThinking || forceTaskTimer > 0);
    const isSpeakingNow = Boolean(st.isSpeaking || speakTimer > 0 || (window.auraSound && window.auraSound.isSpeaking && window.auraSound.isSpeaking()));
    const speedMult = st.ageGroup === '1-15' ? 1.25 : st.ageGroup === '30-60' ? 0.78 : 1.0;
    const strideFreq = (isMusic ? 12 : 7.5) * speedMult;
    const isMoving = st.speed > 8 || isMusic;

    ctx.save();
    ctx.translate(cx, cy + 4 * s);
    const sx = 1 + Math.abs(st.stretchX) * 0.2 - Math.abs(st.stretchY) * 0.1;
    const sy = 1 + Math.abs(st.stretchY) * 0.2 - Math.abs(st.stretchX) * 0.1;
    ctx.scale(st.facing * sx, sy);

    // Crisp flat shadow plate
    ctx.fillStyle = 'rgba(7, 8, 10, 0.38)';
    ctx.fillRect(-26 * s, 26 * s, 52 * s, 4 * s);

    // 4 Articulated Monolith Slabs: Outer Legs (0, 3) + Inner Core Slabs (1, 2)
    const slabOffsets = [-19.5 * s, -6.5 * s, 6.5 * s, 19.5 * s];
    const slabW = 11.5 * s;
    const slabH = 52 * s;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#090a0d';

    for (let i = 0; i < 4; i++) {
      const phase = (i === 0 || i === 3) ? 0 : Math.PI;
      const lift = isMoving ? Math.sin(t * strideFreq + phase) * 3.8 * s : 0;
      const tilt = isMoving ? Math.cos(t * strideFreq + phase) * 0.055 : 0;

      ctx.save();
      ctx.translate(slabOffsets[i], lift);
      ctx.rotate(tilt);

      // Main Monolith Slab Body (Flat Cel-Shaded Titanium / Carbon)
      ctx.fillStyle = (i === 1 || i === 2) ? pal.body : pal.bodyShade;
      ctx.fillRect(-slabW * 0.5, -slabH * 0.5, slabW, slabH);
      ctx.strokeRect(-slabW * 0.5, -slabH * 0.5, slabW, slabH);

      // Top Chamfer Specular Edge (1px crisp flat bevel)
      ctx.fillStyle = pal.bodyHi;
      ctx.fillRect(-slabW * 0.5 + 1.2 * s, -slabH * 0.5 + 1.2 * s, slabW - 2.4 * s, 2.2 * s);

      // Mechanical Servo Joint Seam lines
      ctx.strokeStyle = '#111318';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(-slabW * 0.45, 5 * s);
      ctx.lineTo(slabW * 0.45, 5 * s);
      ctx.moveTo(-slabW * 0.45, 18 * s);
      ctx.lineTo(slabW * 0.45, 18 * s);
      ctx.stroke();
      ctx.strokeStyle = '#090a0d';
      ctx.lineWidth = 2 * s;

      // Recessed OLED Telemetry Screen & Matrix Optics on Center Slabs (1 & 2)
      if (i === 1 || i === 2) {
        ctx.fillStyle = pal.screen;
        ctx.fillRect(-slabW * 0.38, -21 * s, slabW * 0.76, 20 * s);
        ctx.strokeRect(-slabW * 0.38, -21 * s, slabW * 0.76, 20 * s);

        // Glowing Optic Eye Square inside each center slab
        const eyeH = Math.max(1.2 * s, 4.2 * s * (1 - blinkAmount * 0.86));
        const scanX = isWorking ? Math.sin(t * 6) * 1.1 * s : 0;
        ctx.fillStyle = pal.led;
        ctx.fillRect(-2.2 * s + scanX, -17.5 * s, 4.4 * s, eyeH);

        // Animated Moving Voice Waveform / Mouth inside the Monolith Visor!
        if (isSpeakingNow) {
          const talkH = (1.8 + Math.abs(Math.sin(t * 25 + i * 1.4)) * 5.2) * s;
          ctx.fillStyle = '#facc15';
          ctx.fillRect(-2.6 * s, -8 * s - talkH * 0.5, 5.2 * s, talkH);
        } else {
          // Idle/Working telemetry bars inside monolith screen
          const barW = (i === 1 ? 5.2 : 4.0) * s;
          ctx.fillStyle = isWorking ? '#00d68f' : pal.led;
          ctx.fillRect(-2.6 * s, -9.5 * s, barW, 1.6 * s);
          ctx.fillStyle = pal.accent;
          ctx.fillRect(-2.6 * s, -6.5 * s, 3.6 * s, 1.4 * s);
        }
      }

      // Outer Slab Hazard / Status Indicator Strip
      if (i === 0 || i === 3) {
        ctx.fillStyle = pal.led;
        ctx.fillRect(-slabW * 0.3, 19.5 * s, slabW * 0.6, 2.5 * s);
      }

      ctx.restore();
    }

    // Horizontal Hydraulic Hinge Bar locking the 4 slabs together
    ctx.fillStyle = pal.bodyHi;
    ctx.fillRect(-25 * s, -1.5 * s, 50 * s, 3 * s);
    ctx.strokeRect(-25 * s, -1.5 * s, 50 * s, 3 * s);

    ctx.restore();
  }

  // =========================================================================
  // 1B. AEGIS — Bipedal Industrial Field Mech (Inspired by EMO + Teenage Engineering)
  // =========================================================================
  function drawAegis(cx, cy, customPal = null) {
    const pal = customPal || KRONOS_SKINS[st.skin] || KRONOS_SKINS.titanium;
    const s = st.scale;
    const isMusic = Boolean(st.danceModeEnabled || forceDanceTimer > 0);
    const isWorking = Boolean(st.agentWorking || st.isThinking || forceTaskTimer > 0);
    const speedMult = st.ageGroup === '1-15' ? 1.25 : st.ageGroup === '30-60' ? 0.78 : 1.0;
    const strideFreq = (isMusic ? 12 : 8) * speedMult;
    const isMoving = st.speed > 10 || isMusic;
    const bob = isMoving ? Math.abs(Math.sin(t * strideFreq)) * -3.5 * s : Math.sin(t * 2.8) * 1.2 * s;

    ctx.save();
    ctx.translate(cx, cy + 4 * s + bob);
    const sx = 1 + Math.abs(st.stretchX) * 0.2 - Math.abs(st.stretchY) * 0.1;
    const sy = 1 + Math.abs(st.stretchY) * 0.2 - Math.abs(st.stretchX) * 0.1;
    ctx.scale(st.facing * sx, sy);

    ctx.fillStyle = 'rgba(7, 8, 10, 0.35)';
    ctx.fillRect(-20 * s, 25 * s, 40 * s, 4 * s);

    const legL = isMoving ? Math.sin(t * strideFreq) * 3.5 * s : 0;
    const legR = isMoving ? -Math.sin(t * strideFreq) * 3.5 * s : 0;
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#090a0d';

    for (const [lx, lift] of [[-11 * s, legL], [4 * s, legR]]) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(lx + 1.5 * s, 14 * s + lift * 0.4, 4.5 * s, 7 * s);
      ctx.strokeRect(lx + 1.5 * s, 14 * s + lift * 0.4, 4.5 * s, 7 * s);
      ctx.fillStyle = pal.bodyShade;
      ctx.fillRect(lx, 20 * s + lift * 0.5, 8.5 * s, 5.5 * s);
      ctx.strokeRect(lx, 20 * s + lift * 0.5, 8.5 * s, 5.5 * s);
    }

    const armSwing = isMoving ? Math.cos(t * strideFreq) * 3 * s : 0;
    ctx.fillStyle = pal.bodyShade;
    ctx.fillRect(-23 * s, -4 * s + armSwing, 5.5 * s, 16 * s);
    ctx.strokeRect(-23 * s, -4 * s + armSwing, 5.5 * s, 16 * s);

    ctx.fillStyle = pal.body;
    ctx.fillRect(-17 * s, -6 * s, 34 * s, 21 * s);
    ctx.strokeRect(-17 * s, -6 * s, 34 * s, 21 * s);

    ctx.fillStyle = pal.bodyHi;
    ctx.fillRect(-15.5 * s, -4.5 * s, 31 * s, 2.5 * s);

    ctx.fillStyle = pal.dark;
    ctx.fillRect(-13 * s, -0.5 * s, 17 * s, 11 * s);
    ctx.strokeRect(-13 * s, -0.5 * s, 17 * s, 11 * s);

    for (let i = 0; i < 3; i++) {
      const bw = ((i === 0 ? 11 : i === 1 ? 8 : 12) + (isWorking ? (Math.floor(t * 8 + i) % 3) : 0)) * s;
      ctx.fillStyle = i === 0 ? pal.led : pal.accent;
      ctx.fillRect(-11 * s, (1.5 + i * 3) * s, Math.min(13 * s, bw), 1.6 * s);
    }

    ctx.fillStyle = '#ff5500';
    ctx.beginPath();
    ctx.arc(10 * s, 5 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#090a0d';
    ctx.fillRect(9.3 * s, 1.5 * s, 1.4 * s, 3.5 * s);

    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.roundRect(-19 * s, -30 * s, 38 * s, 24 * s, 3 * s);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.bodyHi;
    ctx.fillRect(-17 * s, -28.5 * s, 34 * s, 2.2 * s);

    ctx.fillStyle = pal.screen;
    ctx.beginPath();
    ctx.roundRect(-14.5 * s, -25.5 * s, 29 * s, 16.5 * s, 2 * s);
    ctx.fill();
    ctx.stroke();

    drawOledFaceContents(0, -17.2 * s, 29 * s, 16.5 * s, pal.led, s);

    ctx.fillStyle = pal.body;
    ctx.fillRect(17.5 * s, -4 * s - armSwing, 5.5 * s, 16 * s);
    ctx.strokeRect(17.5 * s, -4 * s - armSwing, 5.5 * s, 16 * s);

    ctx.restore();
  }

  // =========================================================================
  // 2. OPTIX — Deep Research Rover (Inspired by Anki Vector + NASA Rover)
  // =========================================================================
  function drawOptix(cx, cy, customPal = null) {
    const pal = customPal || OPTIX_SKINS[st.skin] || OPTIX_SKINS.archive;
    const s = st.scale;
    const isMusic = Boolean(st.musicPlaying || forceDanceTimer > 0);
    const speedMult = st.ageGroup === '1-15' ? 1.25 : st.ageGroup === '30-60' ? 0.78 : 1.0;
    const rollBounce = Math.sin(t * 11 * speedMult) * (st.speed > 10 || isMusic ? 2.4 : 0.8) * s;

    ctx.save();
    ctx.translate(cx, cy + 5 * s + rollBounce);
    const sx = 1 + Math.abs(st.stretchX) * 0.2 - Math.abs(st.stretchY) * 0.1;
    const sy = 1 + Math.abs(st.stretchY) * 0.2 - Math.abs(st.stretchX) * 0.1;
    ctx.scale(st.facing * sx, sy);

    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#090a0d';

    // Ground shadow plate
    ctx.fillStyle = 'rgba(7, 8, 10, 0.35)';
    ctx.fillRect(-23 * s, 23 * s, 46 * s, 4 * s);

    // Triangular Caterpillar Treads (Anki Vector style)
    ctx.fillStyle = pal.tread;
    ctx.beginPath();
    ctx.roundRect(-21 * s, 11 * s, 42 * s, 13 * s, 4 * s);
    ctx.fill();
    ctx.stroke();

    // Mechanical Bogie Drive Wheels inside tread
    const wheelAngle = t * (st.speed > 10 || isMusic ? 12 : 2) * speedMult;
    for (const wx of [-14 * s, 0, 14 * s]) {
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(wx, 17.5 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.led;
      ctx.fillRect(wx + Math.cos(wheelAngle) * 1.8 * s - 1 * s, 17.5 * s + Math.sin(wheelAngle) * 1.8 * s - 1 * s, 2 * s, 2 * s);
    }

    // Rover Main Body Deck
    ctx.fillStyle = pal.body;
    ctx.fillRect(-17 * s, -3 * s, 34 * s, 15 * s);
    ctx.strokeRect(-17 * s, -3 * s, 34 * s, 15 * s);

    ctx.fillStyle = pal.bodyHi;
    ctx.fillRect(-15.5 * s, -1.5 * s, 31 * s, 2.2 * s);

    // Side utility serial plate
    ctx.fillStyle = '#131519';
    ctx.fillRect(-13 * s, 2.5 * s, 18 * s, 6.5 * s);
    ctx.fillStyle = pal.led;
    ctx.fillRect(-11 * s, 4.5 * s, 8 * s, 2.5 * s);
    ctx.fillStyle = '#ff5500';
    ctx.fillRect(-1 * s, 4.5 * s, 4 * s, 2.5 * s);

    // Articulated Neck Strut
    ctx.fillStyle = '#334155';
    ctx.fillRect(-3.5 * s, -10 * s, 7 * s, 8 * s);
    ctx.strokeRect(-3.5 * s, -10 * s, 7 * s, 8 * s);

    // Vector-style Expressive OLED Optical Head Pod
    const headTilt = Math.sin(t * 3.4) * 0.05;
    ctx.save();
    ctx.translate(1 * s, -19 * s);
    ctx.rotate(headTilt);

    ctx.fillStyle = pal.head;
    ctx.beginPath();
    ctx.roundRect(-18 * s, -10 * s, 36 * s, 20 * s, 4 * s);
    ctx.fill();
    ctx.stroke();

    // Recessed OLED Visor
    ctx.fillStyle = pal.screen;
    ctx.beginPath();
    ctx.roundRect(-14 * s, -7 * s, 28 * s, 14 * s, 2.5 * s);
    ctx.fill();
    ctx.stroke();

    // Expressive OLED Eyes + Moving Mouth
    drawOledFaceContents(0, 0, 28 * s, 14 * s, pal.led, s);

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 3. ORBIT — Autonomous Synth Pod (Inspired by Eilik + Panic Playdate)
  // =========================================================================
  function drawOrbit(cx, cy, customPal = null) {
    const pal = customPal || ORBIT_SKINS[st.skin] || ORBIT_SKINS.ceramic;
    const s = st.scale;
    const isMusic = Boolean(st.musicPlaying || forceDanceTimer > 0);
    const speedMult = st.ageGroup === '1-15' ? 1.25 : st.ageGroup === '30-60' ? 0.78 : 1.0;
    const hover = Math.sin(t * (isMusic ? 9 : 4.2) * speedMult) * (isMusic ? 5 : 3.2) * s;

    ctx.save();
    ctx.translate(cx, cy + hover);
    const sx = 1 + Math.abs(st.stretchX) * 0.2 - Math.abs(st.stretchY) * 0.1;
    const sy = 1 + Math.abs(st.stretchY) * 0.2 - Math.abs(st.stretchX) * 0.1;
    ctx.scale(st.facing * sx, sy);

    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#090a0d';

    // Magnetic Ground Telemetry Ring (crisp flat geometry)
    ctx.fillStyle = pal.led;
    ctx.fillRect(-14 * s, 25 * s - hover * 0.5, 28 * s, 2.5 * s);
    ctx.strokeRect(-14 * s, 25 * s - hover * 0.5, 28 * s, 2.5 * s);

    // Back Floating Magnetic Wing Fin
    const wingBob = Math.sin(t * 6.5) * 2.5 * s;
    ctx.fillStyle = pal.bodyShade;
    ctx.beginPath();
    ctx.roundRect(-24 * s, -4 * s - wingBob, 6 * s, 17 * s, 2 * s);
    ctx.fill();
    ctx.stroke();

    // Main Capsule Pod Chassis
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.roundRect(-17 * s, -25 * s, 34 * s, 43 * s, 9 * s);
    ctx.fill();
    ctx.stroke();

    // Top Specular Bevel Bar
    ctx.fillStyle = pal.bodyHi;
    ctx.fillRect(-11 * s, -22.5 * s, 22 * s, 2.2 * s);

    // Mid-body Industrial Divider & Core Indicator
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-17 * s, 3 * s, 34 * s, 3.5 * s);

    ctx.fillStyle = pal.ring;
    ctx.fillRect(-7 * s, 10 * s, 14 * s, 3.5 * s);
    ctx.strokeRect(-7 * s, 10 * s, 14 * s, 3.5 * s);

    // Curved Edge-to-Edge OLED Face Shield
    ctx.fillStyle = pal.screen;
    ctx.beginPath();
    ctx.roundRect(-13.5 * s, -18.5 * s, 27 * s, 17.5 * s, 3.5 * s);
    ctx.fill();
    ctx.stroke();

    // Expressive OLED Eyes + Moving Mouth
    drawOledFaceContents(0, -9.8 * s, 27 * s, 17.5 * s, pal.led, s);

    // Front Floating Magnetic Wing Fin
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.roundRect(18 * s, -4 * s + wingBob, 6 * s, 17 * s, 2 * s);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // =========================================================================
  // 4. CUSTOM ROBOT RENDERER
  // =========================================================================
  function drawCustomHero(cx, cy, h) {
    const p = h.primaryColor || '#64748b';
    const sec = h.secondaryColor || '#ff5500';
    const acc = h.accentColor || '#f2efe9';

    if (h.artworkDataUrl) {
      const img = getCustomArtImage(h.artworkDataUrl);
      const s = st.scale;
      ctx.save();
      ctx.translate(cx, cy + Math.sin(t * 3.8) * 3 * s);
      const r = 28 * s;
      ctx.fillStyle = '#131417';
      ctx.strokeStyle = p;
      ctx.lineWidth = 2.5 * s;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -r + 2 * s, -r + 2 * s, (r - 2 * s) * 2, (r - 2 * s) * 2);
      }
      ctx.restore();
      return;
    }

    const tpl = h.template || 'kronos';
    if (tpl === 'aegis' || tpl === 'mech') {
      drawAegis(cx, cy, { body: p, bodyHi: acc, bodyShade: '#1e293b', dark: '#090a0d', screen: '#07080a', led: sec, accent: acc });
    } else if (tpl === 'optix' || tpl === 'cat') {
      drawOptix(cx, cy, { body: p, bodyHi: acc, bodyShade: '#1e293b', head: acc, screen: '#07080a', led: sec, tread: '#181a20' });
    } else if (tpl === 'orbit' || tpl === 'dog' || tpl === 'holo') {
      drawOrbit(cx, cy, { body: p, bodyHi: acc, bodyShade: '#1e293b', dark: '#090a0d', screen: '#07080a', led: sec, ring: sec });
    } else {
      drawKronos(cx, cy, { body: p, bodyHi: acc, bodyShade: '#1e293b', dark: '#090a0d', screen: '#07080a', led: sec, accent: acc });
    }
  }

  // =========================================================================
  // 5. TOP-OF-HEAD LIVE AGENT TIMER + STUDIO HEADPHONES + TASK DATA SLATE
  // Zero Emojis · Pure Hardware Vector Geometry
  // =========================================================================
  function getRobotAnchors(ch) {
    if (ch === 'kronos') return { hx: 0, hy: -18, hr: 22, tx: 30, ty: 2 };
    if (ch === 'optix') return { hx: 1, hy: -18, hr: 19, tx: 27, ty: 2 };
    if (ch === 'orbit') return { hx: 0, hy: -15, hr: 18, tx: 27, ty: 2 };
    return { hx: 0, hy: -21, hr: 20, tx: 27, ty: 3 };
  }

  function drawTopOfHeadTimerAndAccessories(cx, cy) {
    const isMusic = Boolean(st.danceModeEnabled || forceDanceTimer > 0);
    const isWorking = Boolean(st.agentWorking || st.isThinking || forceTaskTimer > 0);
    const isSpeakingNow = Boolean(st.isSpeaking || speakTimer > 0 || (window.auraSound && window.auraSound.isSpeaking && window.auraSound.isSpeaking()));
    const isListeningNow = Boolean(st.isListening);
    const s = st.scale;
    const ch = st.customHero ? (st.customHero.template || 'kronos') : st.character;
    const anc = getRobotAnchors(ch);
    const bob = isMusic ? Math.sin(t * 12) * 3 * s : Math.sin(t * 3.5) * 1.2 * s;

    ctx.save();
    ctx.translate(cx, cy + bob);

    // A. HARDWARE STUDIO HEADPHONES (when music/video is playing)
    if (isMusic) {
      const hx = anc.hx * s * st.facing;
      const hy = anc.hy * s;
      const hr = anc.hr * s;

      ctx.save();
      ctx.translate(hx, hy);

      // Stainless wireframe headband + orange signal band
      ctx.strokeStyle = '#090a0d';
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.arc(0, 3 * s, hr + 2.5 * s, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();

      ctx.strokeStyle = '#ff5500';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(0, 3 * s, hr + 2.5 * s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      // Rectangular Teenage-Engineering-style Over-Ear Cups + 3-Bar EQ LEDs
      const earX = hr + 2 * s;
      for (const side of [-1, 1]) {
        const ex = side * earX;
        const ey = 4 * s;
        ctx.fillStyle = '#131519';
        ctx.strokeStyle = '#f2efe9';
        ctx.lineWidth = 1.4 * s;
        ctx.fillRect(ex - 4.2 * s, ey - 7 * s, 8.4 * s, 14 * s);
        ctx.strokeRect(ex - 4.2 * s, ey - 7 * s, 8.4 * s, 14 * s);

        const eqH = (3.5 + Math.abs(Math.sin(t * 16 + side)) * 6.5) * s;
        ctx.fillStyle = isWorking ? '#00d68f' : '#ff5500';
        ctx.fillRect(ex - 1.6 * s, ey + 5 * s - eqH, 3.2 * s, eqH);
      }
      ctx.restore();
    }

    // B. INDUSTRIAL TASK DATA SLATE / FIELD MANUAL (when agent or task is working)
    if (isWorking) {
      const tx = anc.tx * s * st.facing;
      const ty = anc.ty * s + Math.sin(t * 5) * 1.4 * s;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(st.facing, 1);

      // Matte Carbon Data Slate Frame
      ctx.fillStyle = '#111317';
      ctx.strokeStyle = '#00d68f';
      ctx.lineWidth = 1.6 * s;
      ctx.fillRect(-2 * s, -12 * s, 22 * s, 24 * s);
      ctx.strokeRect(-2 * s, -12 * s, 22 * s, 24 * s);

      // Top Header Bar on Slate
      ctx.fillStyle = '#00d68f';
      ctx.fillRect(-2 * s, -12 * s, 22 * s, 3.5 * s);

      // Animated scrolling code/task bars inside Slate
      const phase = Math.floor(t * 5);
      const barLens = [14, 10, 15, 8, 12];
      for (let i = 0; i < 5; i++) {
        const bw = barLens[(i + phase) % barLens.length] * s;
        const by = (-5.5 + i * 3.2) * s;
        ctx.fillStyle = i === (phase % 5) ? '#ff5500' : '#00d68f';
        ctx.fillRect(1.5 * s, by, bw, 1.7 * s);
      }

      // Active white optical reading scanline
      const scanY = (-6 + ((Math.sin(t * 4.8) + 1) * 0.5) * 14) * s;
      ctx.fillStyle = '#f2efe9';
      ctx.fillRect(0.5 * s, scanY, 17 * s, 1 * s);

      ctx.restore();
    }

    // C. TOP-OF-HEAD LIVE AGENT TIMER & TELEMETRY TAG
    // Shows live agent name, ticking MM:SS timer, and start time right above the robot's head!
    if (isWorking || st.agentElapsedSec > 0 || st.activeAgentName) {
      const agName = (st.activeAgentName || st.activeTaskLabel || 'AGENT').toUpperCase().slice(0, 12);
      const timerStr = formatDurationMMSS(st.agentElapsedSec || Math.floor(t));
      const topText = `${agName} // ${timerStr}`;
      const subText = st.activeAgentStartStr
        ? `ON ${st.activeAgentStartStr} · ${(st.activeAgentWhat || 'WORKING').toUpperCase().slice(0, 14)}`
        : (st.activeAgentWhat || 'TASK ACTIVE').toUpperCase().slice(0, 22);

      ctx.save();
      ctx.font = `700 ${Math.max(8, Math.round(8.5 * s))}px "Cascadia Mono", Consolas, monospace`;
      const w1 = ctx.measureText(topText).width;
      ctx.font = `600 ${Math.max(7, Math.round(7.2 * s))}px "Cascadia Mono", Consolas, monospace`;
      const w2 = ctx.measureText(subText).width;

      const boxW = Math.min(188, Math.max(w1, w2) + 18 * s);
      const boxH = 22 * s;
      const boxX = -boxW * 0.5;
      const boxY = -56 * s;

      // Solid Hardware Telemetry Tag Box (0px gradient, sharp 2px corners)
      ctx.fillStyle = '#0d0e11';
      ctx.strokeStyle = '#00d68f';
      ctx.lineWidth = 1.5 * s;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Pulsing green live square indicator
      ctx.fillStyle = Math.floor(t * 4) % 2 === 0 ? '#00d68f' : '#ff5500';
      ctx.fillRect(boxX + 4 * s, boxY + 4 * s, 4 * s, 4 * s);

      ctx.fillStyle = '#f2efe9';
      ctx.font = `700 ${Math.max(8, Math.round(8.5 * s))}px "Cascadia Mono", Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(topText, 2 * s, boxY + 7 * s);

      ctx.fillStyle = '#a0a6b2';
      ctx.font = `600 ${Math.max(7, Math.round(7.2 * s))}px "Cascadia Mono", Consolas, monospace`;
      ctx.fillText(subText, 0, boxY + 16 * s);
      ctx.restore();
    }

    // D. BOTTOM HARDWARE STATUS STRIP (Zero Emojis!)
    if (isListeningNow || isMusic || isWorking || isSpeakingNow) {
      ctx.save();
      const statusText = isListeningNow
        ? 'WHISPER MIC // LISTENING...'
        : isSpeakingNow && st.speechSnippet
          ? `VOICE // ${st.speechSnippet.toUpperCase().slice(0, 18)}`
          : isMusic && isWorking
            ? 'DANCE + TASK // MULTITASK'
            : isMusic
              ? 'DANCE MODE // ON'
              : 'AGENT TASK // READING';

      ctx.font = `700 ${Math.max(8, Math.round(8 * s))}px "Cascadia Mono", Consolas, monospace`;
      const tw = ctx.measureText(statusText).width;
      const pw = Math.min(190, tw + 12 * s);
      const ph = 13 * s;
      const px = -pw * 0.5;
      const py = 32 * s;

      ctx.fillStyle = '#0d0e11';
      ctx.strokeStyle = isListeningNow ? '#ff4d4d' : isSpeakingNow ? '#facc15' : (isMusic && isWorking ? '#ff5500' : isWorking ? '#00d68f' : '#ff5500');
      ctx.lineWidth = 1.4 * s;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeRect(px, py, pw, ph);

      ctx.fillStyle = '#f2efe9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusText, 0, py + ph * 0.52);
      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // MAIN RENDER LOOP
  // =========================================================================
  function draw(now) {
    const dt = Math.min((now - lastTs) / 1000, 0.05);
    lastTs = now;
    t += dt;

    if (happyTimer > 0) happyTimer = Math.max(0, happyTimer - dt);
    if (alertPulse > 0) alertPulse = Math.max(0, alertPulse - dt);
    if (forceDanceTimer > 0) forceDanceTimer = Math.max(0, forceDanceTimer - dt);
    if (forceTaskTimer > 0) forceTaskTimer = Math.max(0, forceTaskTimer - dt);
    if (speakTimer > 0) speakTimer = Math.max(0, speakTimer - dt);

    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blinkAmount = Math.min(1, blinkAmount + dt * 14);
      if (blinkAmount >= 1) blinkTimer = 2.4 + Math.random() * 2.8;
    } else if (blinkAmount > 0) {
      blinkAmount = Math.max(0, blinkAmount - dt * 10);
    }

    updateParticles(dt);

    ctx.clearRect(0, 0, W, H);
    const cx = W * 0.5;
    const cy = H * 0.56;

    if (st.customHero) {
      drawCustomHero(cx, cy, st.customHero);
    } else if (st.character === 'aegis') {
      drawAegis(cx, cy);
    } else if (st.character === 'optix') {
      drawOptix(cx, cy);
    } else if (st.character === 'orbit') {
      drawOrbit(cx, cy);
    } else {
      drawKronos(cx, cy);
    }

    drawTopOfHeadTimerAndAccessories(cx, cy);
    drawParticles();

    if (st.approvals > 0 || st.unread > 0) {
      const badgeColor = st.approvals > 0 ? '#ff5500' : '#00d68f';
      const count = st.approvals > 0 ? st.approvals : st.unread;
      ctx.save();
      ctx.fillStyle = badgeColor;
      ctx.strokeStyle = '#090a0d';
      ctx.lineWidth = 1.5;
      ctx.fillRect(W - 44, 24, 18, 16);
      ctx.strokeRect(W - 44, 24, 18, 16);
      ctx.fillStyle = '#090a0d';
      ctx.font = 'bold 10px "Cascadia Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.min(count, 9)), W - 35, 32.5);
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  api.onFishState((data) => {
    if (!data) return;
    st.character = data.character || 'kronos';
    st.movementArchetype = data.movementArchetype || 'stride';
    st.customHero = data.customHero || null;
    st.skin = data.skin || 'titanium';
    st.ageGroup = data.ageGroup || '15-30';
    st.vx = data.vx || 0;
    st.vy = data.vy || 0;
    st.speed = data.speed || 0;
    st.facing = data.facing || 1;
    st.pitch = data.pitch || 0;
    st.mode = data.mode || 'swim';
    st.scale = clamp(data.scale || 1.06, 0.72, 1.4);
    st.animalState = data.animalState || 'walking';
    st.stretchX = Number(data.stretchX) || 0;
    st.stretchY = Number(data.stretchY) || 0;
    st.squishMag = Number(data.squishMag) || 0;
    st.hudOpen = Boolean(data.hudOpen);
    st.isDragging = Boolean(data.isDragging);
    st.isThinking = Boolean(data.isThinking);
    st.approvals = data.approvals || 0;
    st.unread = data.unread || 0;
    st.unreadWA = data.unreadWA || 0;
    st.musicPlaying = Boolean(data.musicPlaying);
    st.danceModeEnabled = Boolean(data.danceModeEnabled);
    st.isListening = Boolean(data.isListening);
    st.agentWorking = Boolean(data.agentWorking);
    st.activeTaskLabel = data.activeTaskLabel || '';
    st.activeAgentName = data.activeAgentName || '';
    st.activeAgentWhat = data.activeAgentWhat || '';
    st.activeAgentStartStr = data.activeAgentStartStr || '';
    st.agentElapsedSec = Number(data.agentElapsedSec) || 0;
    if (typeof data.isSpeaking === 'boolean') st.isSpeaking = data.isSpeaking;
    if (data.speechSnippet !== undefined) st.speechSnippet = data.speechSnippet || '';
  });

  api.onFishReaction((data) => {
    const kind = data?.kind || data?.type || 'pet';
    if (kind === 'dance') {
      forceDanceTimer = 7.0;
      happyTimer = 3.0;
      spawnParticles(W * 0.5, H * 0.42, 6, 'spark', '#ff5500');
    } else if (kind === 'dance-off') {
      forceDanceTimer = 0;
    } else if (kind === 'task') {
      forceTaskTimer = 9.0;
      happyTimer = 2.0;
      spawnParticles(W * 0.5, H * 0.46, 6, 'spark', '#00d68f');
    } else if (kind === 'multitask') {
      forceDanceTimer = 9.0;
      forceTaskTimer = 9.0;
      happyTimer = 3.5;
      spawnParticles(W * 0.5, H * 0.42, 6, 'spark', '#ff5500');
      spawnParticles(W * 0.5, H * 0.5, 6, 'spark', '#00d68f');
    } else if (kind === 'speak') {
      speakTimer = Math.max(3.5, Number(data?.duration) || 4.5);
      st.speechSnippet = data?.text || st.speechSnippet || '';
      spawnParticles(W * 0.5, H * 0.44, 4, 'spark', '#facc15');
    } else if (kind === 'boing') {
      happyTimer = 1.4;
      window.auraSound?.playStretchBoing();
      spawnParticles(W * 0.5, H * 0.5, 6, 'spark', '#00d68f');
    } else if (kind === 'approval' || kind === 'whatsapp' || kind === 'discovered') {
      alertPulse = 2.0;
      spawnParticles(W * 0.5, H * 0.42, 7, 'spark', '#ff5500');
    } else {
      happyTimer = 1.8;
      spawnParticles(W * 0.5, H * 0.44, 6, 'spark', '#00d68f');
    }
  });

  api.onAudioCmd((cmd) => {
    if (!cmd || !window.auraSound) return;
    if (cmd.type === 'speak') {
      const words = String(cmd.text || '').trim().split(/\s+/).length;
      speakTimer = Math.max(2.6, Math.min(14, words * 0.38));
      st.speechSnippet = String(cmd.text || '').slice(0, 36);
      window.auraSound.speak(cmd.text, cmd.character, cmd.enabled !== false, cmd.audioDataUrl || null);
    } else if (cmd.type === 'stop-speak') {
      speakTimer = 0;
      window.auraSound.stopSpeaking();
    } else if (cmd.type === 'motif') {
      window.auraSound.playCharacterMotif(cmd.character, cmd.vol ?? 0.85);
    } else if (cmd.type === 'bgm-start') {
      window.auraSound.startBgmLoop(cmd.character);
    } else if (cmd.type === 'bgm-stop') {
      window.auraSound.stopBgmLoop();
    }
  });

  let dragStart = null;
  let dragged = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) { api.fishContextMenu(); return; }
    if (e.button !== 0) return;
    dragStart = { x: e.screenX, y: e.screenY };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    if (!dragged && Math.hypot(e.screenX - dragStart.x, e.screenY - dragStart.y) > 5) {
      dragged = true;
      api.fishDragStart();
    }
  });
  window.addEventListener('pointerup', () => {
    if (!dragStart) return;
    if (dragged) api.fishDragEnd();
    else api.fishClicked();
    dragStart = null;
    dragged = false;
  });
  canvas.addEventListener('dblclick', () => api.fishDoubleClicked());
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); api.fishContextMenu(); });

  requestAnimationFrame(draw);
})();
