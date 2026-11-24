/**
 * OV Original 4-Companion HTML5 Canvas Renderer:
 *  1) Vesper — Futuristic Hooded Acrobat Bot (kinetic tether swing, 360° flips, inverted hang, elastic squish)
 *  2) Vector — Orbital Aero-Mech Scout (curved domevisor, swept wings, hexagonal gyro core, twin ion thrusters)
 *  3) Core   — Holographic AI Sphere (translucent orb, concentric telemetry rings, neural lattice, sonar ripples)
 *  4) Coral  — Bioluminescent Reef Companion (translucent ribbon fins, organic reef markings, rising bubbles)
 *
 * 100% original procedural artwork & 20 original skins — zero third-party character assets.
 */
(function () {
  const api = window.petFishAPI;
  const canvas = document.getElementById('fish-canvas');
  const ctx = canvas.getContext('2d');
  const badge = document.getElementById('fish-badge');
  const badgeText = document.getElementById('fish-badge-text');

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = window.innerWidth;
  let H = window.innerHeight;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const st = {
    character: 'vesper', // 'vesper' | 'vector' | 'core' | 'coral'
    skin: 'crimson',
    ageGroup: '15-30',
    vx: -65,
    vy: 0,
    speed: 65,
    facing: -1,
    facingScale: -1,
    pitch: 0,
    mode: 'swim',
    scale: 1.08,
    acrobatState: 'swinging',
    swingCycle: 0,
    stretchX: 0,
    stretchY: 0,
    squishMag: 0,
    hudOpen: false,
    isDragging: false,
    isThinking: false,
    cursorLocalX: 40,
    cursorLocalY: 80,
    approvals: 0,
    unread: 0,
    unreadWA: 0,
    musicPlaying: false,
    musicTitle: '',
    hovered: false,
  };

  // 20 Original OV Skin Palettes across 4 Original Companions
  const VESPER_SKINS = {
    crimson:  { hoodHi: '#F43F5E', hoodMid: '#E11D48', hoodDeep: '#881337', trim: '#38BDF8', visor: '#0B1120', eye: '#E0F2FE', tether: '#7DD3FC', scarf: '#FB7185' },
    obsidian: { hoodHi: '#334155', hoodMid: '#1E293B', hoodDeep: '#090D16', trim: '#F43F5E', visor: '#050811', eye: '#FDA4AF', tether: '#FB7185', scarf: '#E11D48' },
    eclipse:  { hoodHi: '#475569', hoodMid: '#18181B', hoodDeep: '#09090B', trim: '#E2E8F0', visor: '#020617', eye: '#FFFFFF', tether: '#E2E8F0', scarf: '#94A3B8' },
    gilded:   { hoodHi: '#E11D48', hoodMid: '#9F1239', hoodDeep: '#4C0519', trim: '#FACC15', visor: '#0F172A', eye: '#FEF08A', tether: '#FDE047', scarf: '#F59E0B' },
    frost:    { hoodHi: '#F8FAFC', hoodMid: '#E2E8F0', hoodDeep: '#94A3B8', trim: '#EC4899', visor: '#0F172A', eye: '#67E8F9', tether: '#F472B6', scarf: '#38BDF8' },
    emerald:  { hoodHi: '#1E293B', hoodMid: '#0F172A', hoodDeep: '#020617', trim: '#10B981', visor: '#022C22', eye: '#6EE7B7', tether: '#34D399', scarf: '#10B981' },
  };

  const VECTOR_SKINS = {
    valkyrie: { hullHi: '#F59E0B', hullMid: '#D97706', hullDeep: '#78350F', wing: '#B91C1C', visor: '#0C1424', eye: '#38BDF8', core: '#38BDF8', flame: '#67E8F9' },
    titanium: { hullHi: '#F1F5F9', hullMid: '#CBD5E1', hullDeep: '#64748B', wing: '#475569', visor: '#0F172A', eye: '#22D3EE', core: '#22D3EE', flame: '#A5F3FC' },
    cobalt:   { hullHi: '#60A5FA', hullMid: '#2563EB', hullDeep: '#1E3A8A', wing: '#334155', visor: '#090D16', eye: '#93C5FD', core: '#F43F5E', flame: '#FB7185' },
    orbital:  { hullHi: '#FFFFFF', hullMid: '#E2E8F0', hullDeep: '#94A3B8', wing: '#F59E0B', visor: '#0B1324', eye: '#FDE047', core: '#38BDF8', flame: '#7DD3FC' },
    stealth:  { hullHi: '#334155', hullMid: '#0F172A', hullDeep: '#020617', wing: '#1D4ED8', visor: '#030712', eye: '#38BDF8', core: '#38BDF8', flame: '#60A5FA' },
  };

  const CORE_SKINS = {
    solar:  { core: '#FDE68A', mid: '#F59E0B', ring: '#FBBF24', glow: 'rgba(245,158,11,0.45)', accent: '#FFFBEB' },
    aether: { core: '#CFFAFE', mid: '#06B6D4', ring: '#38BDF8', glow: 'rgba(56,189,248,0.45)', accent: '#ECFEFF' },
    matrix: { core: '#A7F3D0', mid: '#10B981', ring: '#34D399', glow: 'rgba(16,185,129,0.45)', accent: '#ECFDF5' },
    nova:   { core: '#FECDD3', mid: '#E11D48', ring: '#FB7185', glow: 'rgba(244,63,94,0.48)', accent: '#FFF1F2' },
    pearl:  { core: '#FFFFFF', mid: '#CBD5E1', ring: '#E2E8F0', glow: 'rgba(226,232,240,0.42)', accent: '#FFFFFF' },
  };

  const CORAL_SKINS = {
    tangerine: { top: '#FB923C', mid: '#F97316', deep: '#C2410C', fin: '#2DD4BF', spot: '#FFF7ED', belly: '#FFEDD5' },
    sapphire:  { top: '#38BDF8', mid: '#2563EB', deep: '#1E3A8A', fin: '#FACC15', spot: '#E0F2FE', belly: '#BAE6FD' },
    koi:       { top: '#FFFFFF', mid: '#F8FAFC', deep: '#CBD5E1', fin: '#FB923C', spot: '#EF4444', belly: '#FFFFFF' },
    blossom:   { top: '#F472B6', mid: '#EC4899', deep: '#9D174D', fin: '#67E8F9', spot: '#FDF2F8', belly: '#FCE7F3' },
  };

  let coreClickPulse = 0;
  let time = 0;
  let swimPhase = 0;
  let blinkTimer = 3.0;
  let blinkAmount = 0;
  let bubbleTimer = 0.7;
  let noteTimer = 0.45;
  let excitedTimer = 0;
  let happyTimer = 0;
  let forceDanceTimer = 0;
  let wiggleBoost = 0;
  let prevSwingCycle = 0;
  let tetherBurstTimer = 0;
  let waveCycleTimer = 4.5;
  const particles = [];

  function spawnBubble(tint = 'rgba(220, 246, 255, 0.88)') {
    const cx = W * 0.5;
    const cy = H * 0.55;
    particles.push({
      kind: 'bubble',
      x: cx + st.facingScale * 32 * st.scale,
      y: cy - 6 * st.scale,
      vx: (Math.random() - 0.5) * 16,
      vy: -22 - Math.random() * 22,
      r: (2.0 + Math.random() * 3.4) * st.scale,
      life: 0,
      maxLife: 1.15 + Math.random() * 0.75,
      wobble: Math.random() * Math.PI * 2,
      tint,
    });
  }

  function spawnSparks(x, y, count = 6, tint = '#F8FAFF') {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.45;
      const spd = 28 + Math.random() * 36;
      particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 10,
        r: 1.9 + Math.random() * 2.5,
        life: 0,
        maxLife: 0.65 + Math.random() * 0.35,
        wobble: Math.random() * Math.PI * 2,
        tint,
      });
    }
  }

  function spawnHearts(count = 5) {
    const cx = W * 0.5;
    const cy = H * 0.48;
    for (let i = 0; i < count; i++) {
      particles.push({
        kind: 'heart',
        x: cx + (Math.random() - 0.5) * 40,
        y: cy - 12,
        vx: (Math.random() - 0.5) * 26,
        vy: -32 - Math.random() * 22,
        r: 5.2 + Math.random() * 3.0,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2,
        tint: i % 2 === 0 ? '#FF5E8E' : '#FF85A1',
      });
    }
  }

  function spawnMusicNote(isCoral) {
    const cx = W * 0.5;
    const cy = H * 0.44;
    const glyphs = ['♪', '♫', '♩'];
    const tints = isCoral ? ['#2DD4BF', '#FB923C', '#E0F2FE'] : ['#F43F5E', '#38BDF8', '#FBBF24'];
    particles.push({
      kind: 'note',
      x: cx + (Math.random() - 0.5) * 44,
      y: cy - 16,
      vx: (Math.random() - 0.5) * 18,
      vy: -24 - Math.random() * 18,
      r: 12 + Math.random() * 4,
      life: 0,
      maxLife: 1.35 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      tint: tints[Math.floor(Math.random() * tints.length)],
    });
  }

  function triggerReaction(type) {
    if (type === 'dance') {
      forceDanceTimer = 7.5;
      happyTimer = 4.0;
      wiggleBoost = 1.6;
      spawnMusicNote(st.character === 'coral');
      spawnMusicNote(st.character === 'coral');
    } else if (type === 'approval') {
      excitedTimer = 4.2;
      wiggleBoost = 1.6;
      spawnSparks(W * 0.5, H * 0.45, 10, '#FACC15');
    } else if (type === 'whatsapp' || type === 'discovered') {
      excitedTimer = 3.5;
      wiggleBoost = 1.4;
      spawnSparks(W * 0.5, H * 0.45, 9, type === 'whatsapp' ? '#34D399' : '#38BDF8');
    } else if (type === 'pet' || type === 'allow') {
      happyTimer = 2.8;
      wiggleBoost = 1.1;
      spawnHearts(6);
      spawnSparks(W * 0.5, H * 0.45, 6, '#FDBA74');
    } else {
      wiggleBoost = 1.0;
      spawnSparks(W * 0.5, H * 0.45, 6, '#93C5FD');
    }
  }

  api.onFishState((data) => {
    if (!data) return;
    if (data.character) st.character = data.character;
    if (data.skin) st.skin = data.skin;
    if (data.ageGroup) st.ageGroup = data.ageGroup;
    st.vx = data.vx;
    st.vy = data.vy;
    st.speed = data.speed;
    st.facing = data.facing;
    st.pitch = data.pitch;
    st.mode = data.mode;
    st.scale = clamp(data.scale || 1.08, 0.72, 1.32);
    st.acrobatState = data.acrobatState || 'swinging';
    st.stretchX = Number(data.stretchX) || 0;
    st.stretchY = Number(data.stretchY) || 0;
    st.squishMag = Number(data.squishMag) || 0;

    // Fresh kinetic tether grapple burst when swing cycle resets
    const nextCycle = data.swingCycle || 0;
    if (st.character === 'vesper' && st.acrobatState === 'swinging' && prevSwingCycle > 0.65 && nextCycle < 0.25) {
      tetherBurstTimer = 0.35;
      spawnSparks(W * 0.5 + st.facing * 20, H * 0.42, 6, '#7DD3FC');
    }
    prevSwingCycle = nextCycle;
    st.swingCycle = nextCycle;

    st.hudOpen = Boolean(data.hudOpen);
    st.isDragging = Boolean(data.isDragging);
    st.isThinking = Boolean(data.isThinking);
    st.cursorLocalX = data.cursorLocalX;
    st.cursorLocalY = data.cursorLocalY;
    st.approvals = data.approvals || 0;
    st.unread = data.unread || 0;
    st.unreadWA = data.unreadWA || 0;
    st.musicPlaying = Boolean(data.musicPlaying);
    st.musicTitle = String(data.musicTitle || '');

    if (!st.hudOpen && (st.approvals > 0 || st.unread > 0 || st.isThinking)) {
      badge.classList.remove('hidden');
      badge.classList.toggle('urgent', st.approvals > 0);
      badge.classList.toggle('whatsapp', st.approvals === 0 && st.unreadWA > 0);
      badgeText.textContent = st.isThinking
        ? 'AI...'
        : st.approvals > 0
          ? `${st.approvals} Allow`
          : st.unreadWA > 0
            ? `${st.unreadWA} WA`
            : `${st.unread}`;
    } else {
      badge.classList.add('hidden');
    }
  });

  api.onFishReaction((ev) => {
    if (ev?.type === 'boing') {
      coreClickPulse = 1.0;
      if (window.auraSound) window.auraSound.playStretchBoing();
      spawnSparks(W * 0.5, H * 0.5, 6, '#FFFFFF');
    } else if (ev?.type) {
      if (ev.type === 'pet') coreClickPulse = 1.0;
      triggerReaction(ev.type);
    }
  });

  if (api.onAudioCmd) {
    api.onAudioCmd((cmd) => {
      if (!cmd || !window.auraSound) return;
      if (cmd.type === 'speak') window.auraSound.speak(cmd.text, cmd.character || st.character, cmd.enabled !== false);
      else if (cmd.type === 'stop-speak') window.auraSound.stopSpeaking();
      else if (cmd.type === 'motif') window.auraSound.playCharacterMotif(cmd.character || st.character, cmd.vol || 0.9);
      else if (cmd.type === 'bgm-start') window.auraSound.startBgmLoop(cmd.character || st.character);
      else if (cmd.type === 'bgm-stop') window.auraSound.stopBgmLoop();
    });
  }

  let down = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastClick = 0;

  window.addEventListener('mouseenter', () => { st.hovered = true; });
  window.addEventListener('mouseleave', () => { st.hovered = false; });

  window.addEventListener('mousedown', (e) => {
    if (e.target.closest('#fish-badge')) return;
    if (e.button === 2) { e.preventDefault(); api.fishContextMenu(); return; }
    if (e.button === 0) { down = true; moved = false; startX = e.screenX; startY = e.screenY; }
  });

  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    if (!moved && Math.hypot(e.screenX - startX, e.screenY - startY) > 5) {
      moved = true;
      document.body.classList.add('dragging');
      api.fishDragStart();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!down) return;
    down = false;
    document.body.classList.remove('dragging');
    if (moved) { api.fishDragEnd(); return; }
    if (e.button === 0) {
      const now = Date.now();
      if (now - lastClick < 290) { triggerReaction('pet'); api.fishDoubleClicked(); }
      else api.fishClicked();
      lastClick = now;
    }
  });

  window.addEventListener('contextmenu', (e) => { e.preventDefault(); api.fishContextMenu(); });
  badge.addEventListener('click', (e) => { e.stopPropagation(); api.fishClicked(); });

  function getAgeHeadFactor() {
    if (st.ageGroup === '0-15') return 1.12;
    if (st.ageGroup === '30-60') return 0.92;
    return 1.0;
  }

  function applyElasticSquish() {
    const mag = clamp(st.squishMag || 0, 0, 1.15);
    if (mag < 0.01) return;
    const ang = Math.atan2(st.stretchY || 0, st.stretchX || 0.001);
    const sx = 1 + mag * 0.24;
    const sy = 1 / Math.sqrt(sx);
    ctx.rotate(ang);
    ctx.scale(sx, sy);
    ctx.rotate(-ang);
  }

  function drawBeatRings(cx, cy, s, isCoral) {
    const beat = Math.abs(Math.sin(time * 6.4));
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 2; i++) {
      const phase = (time * 1.45 + i * 0.5) % 1;
      const rx = (22 + phase * 26) * s;
      const ry = (8 + phase * 10) * s;
      ctx.globalAlpha = (1 - phase) * (0.34 + beat * 0.25);
      ctx.strokeStyle = isCoral ? (i === 0 ? '#2DD4BF' : '#FB923C') : (i === 0 ? '#F43F5E' : '#38BDF8');
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawThinkingHalo(cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 2.2);
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3;
      ctx.fillStyle = i === 0 ? '#38BDF8' : i === 1 ? '#F472B6' : '#FBBF24';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 38 * s, Math.sin(a) * 38 * s, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // =========================================================================
  // 1. VESPER — ORIGINAL FUTURISTIC HOODED ACROBAT COMPANION
  // =========================================================================
  function drawVesper(cx, cy) {
    const pal = VESPER_SKINS[st.skin] || VESPER_SKINS.crimson;
    const s = st.scale;
    const headFac = getAgeHeadFactor();
    const isDancing = st.musicPlaying || forceDanceTimer > 0;
    const isHanging = st.acrobatState === 'hanging' && !isDancing;
    const isFlipping = st.acrobatState === 'flipping' && !isDancing;
    const isSwinging = st.acrobatState === 'swinging' && !isDancing;

    if (isDancing) drawBeatRings(cx, cy + 28 * s, s, false);
    if (st.isThinking) drawThinkingHalo(cx, cy, s);

    // Kinetic Plasma Tether Line (when hanging inverted or swinging!)
    if (!st.isDragging && (isHanging || isSwinging)) {
      ctx.save();
      const anchorX = isHanging ? cx : cx + st.facing * 52 * s;
      const anchorY = 6;
      const handX = isHanging ? cx : cx + st.facing * 12 * s;
      const handY = isHanging ? cy - 22 * s : cy - 16 * s;

      ctx.strokeStyle = pal.tether;
      ctx.lineWidth = tetherBurstTimer > 0 ? 2.6 : 1.7;
      ctx.shadowColor = pal.tether;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      ctx.quadraticCurveTo((anchorX + handX) * 0.5 + Math.sin(time * 4) * 4, (anchorY + handY) * 0.5, handX, handY);
      ctx.stroke();

      // Anchor pulse node
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(anchorX, anchorY + 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    const danceBounce = isDancing ? Math.abs(Math.sin(time * 7.2)) * -9 * s : 0;
    const idleBob = Math.sin(time * 2.8) * 3.2 * s;
    ctx.translate(cx, cy + danceBounce + idleBob);
    applyElasticSquish();

    // Soft ground/air shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 38 * s, 22 * s, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flip or hanging orientation
    if (isHanging) {
      ctx.rotate(Math.PI + Math.sin(time * 2.2) * 0.08);
    } else if (isFlipping) {
      const flipProg = clamp((st.swingCycle - 0.72) / 0.28, 0, 1);
      ctx.rotate(st.facing * flipProg * Math.PI * 2);
    } else if (isDancing) {
      ctx.rotate(Math.sin(time * 7.2) * 0.16);
    } else {
      ctx.rotate(clamp(st.vx * 0.0014, -0.26, 0.26));
    }

    ctx.scale(st.facingScale * s, s);

    // Flowing kinetic ribbon scarf trailing behind!
    ctx.save();
    const scarfWave = Math.sin(time * (isDancing ? 12 : 5.5)) * 6;
    ctx.fillStyle = pal.scarf;
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.quadraticCurveTo(-24, 2 + scarfWave * 0.6, -34, 10 + scarfWave);
    ctx.quadraticCurveTo(-24, 16 + scarfWave * 0.5, -6, 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Compact agile legs / boots
    const legKick = isDancing ? Math.sin(time * 14) * 5 : Math.sin(swimPhase * 0.9) * 3;
    ctx.fillStyle = pal.hoodDeep;
    ctx.strokeStyle = '#0B1020';
    ctx.lineWidth = 2.0;
    // Back leg
    ctx.beginPath();
    ctx.roundRect(-9, 20, 8, 13 + legKick * 0.3, 4);
    ctx.fill(); ctx.stroke();
    // Front leg
    ctx.beginPath();
    ctx.roundRect(1, 20, 8, 13 - legKick * 0.3, 4);
    ctx.fill(); ctx.stroke();
    // Boot trim accents
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-8, 28, 6, 2.5);
    ctx.fillRect(2, 28, 6, 2.5);

    // Sleek athletic hooded jacket torso
    const bodyGrad = ctx.createLinearGradient(-12, 4, 12, 24);
    bodyGrad.addColorStop(0, pal.hoodHi);
    bodyGrad.addColorStop(0.6, pal.hoodMid);
    bodyGrad.addColorStop(1, pal.hoodDeep);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-12, 4, 24, 19, 8);
    ctx.fill();
    ctx.stroke();

    // Original OV geometric chevron emblem on chest
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, 11);
    ctx.lineTo(0, 16);
    ctx.lineTo(5, 11);
    ctx.stroke();

    // Articulated arms with luminous grapple wristbands
    const armAng = isDancing ? Math.sin(time * 14) * 0.55 : isHanging ? -0.5 + Math.sin(time * 3) * 0.2 : -0.35 + Math.sin(swimPhase) * 0.22;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 11, 9);
      ctx.rotate(side * armAng);
      ctx.fillStyle = pal.hoodMid;
      ctx.strokeStyle = '#0B1020';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.roundRect(-3.5, -2, 7, 13, 3.5);
      ctx.fill(); ctx.stroke();
      // Glowing grapple emitter band
      ctx.fillStyle = pal.trim;
      ctx.fillRect(-3, 7, 6, 2.5);
      ctx.restore();
    });

    // Big cute rounded futuristic hooded head
    ctx.save();
    ctx.scale(headFac, headFac);

    // Cute side cyber-ear / antenna tabs on hood
    ctx.fillStyle = pal.trim;
    ctx.strokeStyle = '#0B1020';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-17, -14); ctx.lineTo(-23, -24); ctx.lineTo(-10, -22); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(17, -14); ctx.lineTo(23, -24); ctx.lineTo(10, -22); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Smooth hood dome
    const headGrad = ctx.createRadialGradient(-6, -20, 4, 0, -11, 24);
    headGrad.addColorStop(0, pal.hoodHi);
    headGrad.addColorStop(0.65, pal.hoodMid);
    headGrad.addColorStop(1, pal.hoodDeep);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, -11, 21, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glossy dark panoramic curved visor (distinct original futuristic design!)
    ctx.fillStyle = pal.visor;
    ctx.beginPath();
    ctx.roundRect(-15.5, -18, 31, 15, 7.5);
    ctx.fill();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Expressive glowing LED eyes inside visor
    const isHappy = happyTimer > 0 || isDancing || st.hovered;
    ctx.save();
    ctx.shadowColor = pal.eye;
    ctx.shadowBlur = 7;
    if (isHappy) {
      // Cute happy curved ^ ^ LED arcs
      ctx.strokeStyle = pal.eye;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-6.5, -9.5, 4.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6.5, -9.5, 4.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      // Cute glowing oval LED eyes with blink!
      const eyeH = Math.max(0.8, 4.6 * (1 - blinkAmount * 0.92));
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(-6.5, -10.5, 3.6, eyeH, 0, 0, Math.PI * 2);
      ctx.ellipse(6.5, -10.5, 3.6, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      if (blinkAmount < 0.4) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-5.3, -12, 1.2, 0, Math.PI * 2);
        ctx.arc(7.7, -12, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Subtle visor glass specular glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-6, -15.5, 7, 2.0, -0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 2. VECTOR — ORIGINAL ORBITAL AERO-MECH SCOUT COMPANION
  // =========================================================================
  function drawVector(cx, cy) {
    const pal = VECTOR_SKINS[st.skin] || VECTOR_SKINS.valkyrie;
    const s = st.scale;
    const headFac = getAgeHeadFactor();
    const isDancing = st.musicPlaying || forceDanceTimer > 0;
    const hoverY = Math.sin(time * (isDancing ? 9 : 3.6)) * (isDancing ? 7 : 4.2) * s;

    if (isDancing) drawBeatRings(cx, cy + 30 * s, s, false);
    if (st.isThinking) drawThinkingHalo(cx, cy, s);

    ctx.save();
    ctx.translate(cx, cy + hoverY);
    applyElasticSquish();

    // Glowing ion air-cushion shadow
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 40 * s, 24 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const bank = isDancing ? Math.sin(time * 8.5) * 0.16 : clamp(st.vx * 0.0014, -0.26, 0.26);
    ctx.rotate(bank);
    ctx.scale(s, s);

    // Swept Aero-Mech Twin Back Wings (distinctive original silhouette!)
    const wingBeat = isDancing ? Math.sin(time * 12) * 0.14 : Math.sin(time * 3.5) * 0.04;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 12, 6);
      ctx.rotate(side * (-0.28 + wingBeat));
      ctx.fillStyle = pal.wing;
      ctx.strokeStyle = '#0B1020';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(side * 22, -13);
      ctx.lineTo(side * 18, 4);
      ctx.lineTo(0, 7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Wingtip LED strip
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(side * 5, -5);
      ctx.lineTo(side * 19, -10.5);
      ctx.stroke();
      ctx.restore();
    });

    // Twin Ion Plasma Thruster Plumes
    const flameLen = (12 + Math.sin(time * 32) * 4 + (st.speed > 90 ? 6 : 0));
    [-7.5, 7.5].forEach((fx) => {
      const fg = ctx.createLinearGradient(fx, 24, fx, 24 + flameLen);
      fg.addColorStop(0, '#FFFFFF');
      fg.addColorStop(0.4, pal.flame);
      fg.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(fx - 3.8, 24);
      ctx.lineTo(fx + 3.8, 24);
      ctx.lineTo(fx, 24 + flameLen);
      ctx.closePath();
      ctx.fill();
    });

    // Thruster pods / legs
    ctx.fillStyle = pal.hullDeep;
    ctx.strokeStyle = '#0B1020';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.roundRect(-11.5, 16, 8, 11, 3.5);
    ctx.roundRect(3.5, 16, 8, 11, 3.5);
    ctx.fill(); ctx.stroke();

    // Compact rounded mech chassis
    const bodyGrad = ctx.createLinearGradient(-14, 2, 14, 20);
    bodyGrad.addColorStop(0, pal.hullHi);
    bodyGrad.addColorStop(0.6, pal.hullMid);
    bodyGrad.addColorStop(1, pal.hullDeep);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-13.5, 3, 27, 17, 7);
    ctx.fill(); ctx.stroke();

    // Glowing Hexagonal Gyro-Core on chest
    ctx.save();
    ctx.shadowColor = pal.core;
    ctx.shadowBlur = 11;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = pal.core;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * 4.4;
      const py = 11.5 + Math.sin(a) * 4.4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Articulated stabilizer arms
    const armTilt = isDancing ? Math.sin(time * 13) * 0.45 : 0.25;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 14, 8);
      ctx.rotate(side * armTilt);
      ctx.fillStyle = pal.hullMid;
      ctx.strokeStyle = '#0B1020';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-3.2, -1, 6.4, 12, 3.2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.core;
      ctx.beginPath();
      ctx.arc(0, 10, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Sleek Rounded Orbital Scout Helmet + Panoramic Curved Glass Domevisor
    ctx.save();
    ctx.scale(headFac, headFac);
    const helmGrad = ctx.createRadialGradient(-5, -22, 4, 0, -12, 24);
    helmGrad.addColorStop(0, pal.hullHi);
    helmGrad.addColorStop(0.65, pal.hullMid);
    helmGrad.addColorStop(1, pal.hullDeep);
    ctx.fillStyle = helmGrad;
    ctx.strokeStyle = '#0B1020';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.roundRect(-19, -29, 38, 32, 15);
    ctx.fill(); ctx.stroke();

    // Cute twin crest antenna fins on top
    ctx.fillStyle = pal.wing;
    ctx.beginPath();
    ctx.roundRect(-3.5, -34, 7, 6, 3);
    ctx.fill(); ctx.stroke();

    // Smooth curved panoramic dark-glass visor (astronaut / scout drone aesthetic!)
    ctx.fillStyle = pal.visor;
    ctx.beginPath();
    ctx.roundRect(-14.5, -22, 29, 17, 8.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Glowing friendly digital drone eyes inside visor
    ctx.save();
    ctx.shadowColor = pal.eye;
    ctx.shadowBlur = 9;
    const isHappy = happyTimer > 0 || isDancing;
    if (isHappy) {
      ctx.strokeStyle = pal.eye;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-6, -12.5, 3.8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6, -12.5, 3.8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      const hEye = Math.max(1.0, 3.4 * (1 - blinkAmount * 0.9));
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.roundRect(-10, -15, 7.5, hEye * 2, 3);
      ctx.roundRect(2.5, -15, 7.5, hEye * 2, 3);
      ctx.fill();
    }
    ctx.restore();

    // Visor top specular arc
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(-4, -19.5, 8.5, 2.2, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // 3. CORE — ORIGINAL OV HOLOGRAPHIC AI SPHERE
  // =========================================================================
  function drawCore(cx, cy) {
    const pal = CORE_SKINS[st.skin] || CORE_SKINS.solar;
    const s = st.scale;
    const isDancing = st.musicPlaying || forceDanceTimer > 0;
    const breathe = 1 + Math.sin(time * (isDancing ? 8 : 2.8)) * 0.05;

    ctx.save();
    ctx.translate(cx, cy + Math.sin(time * 2.2) * 4 * s);
    applyElasticSquish();
    ctx.scale(s, s);

    // Interactive click sonar ripple
    if (coreClickPulse > 0.01) {
      const prog = 1 - coreClickPulse;
      ctx.save();
      ctx.globalAlpha = coreClickPulse * 0.72;
      ctx.strokeStyle = pal.ring;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 26 + prog * 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Soft radial holographic halo
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 44 * breathe);
    halo.addColorStop(0, pal.core);
    halo.addColorStop(0.42, pal.glow);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 44 * breathe, 0, Math.PI * 2);
    ctx.fill();

    // Outer rotating precision telemetry ring
    ctx.save();
    ctx.rotate(time * (st.isThinking ? 2.4 : 0.75));
    ctx.strokeStyle = pal.ring;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([18, 8, 5, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Micro tick marks
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.lineTo(Math.cos(a) * 33, Math.sin(a) * 33);
      ctx.stroke();
    }
    ctx.restore();

    // Counter-rotating inclined orbital ellipses
    ctx.save();
    ctx.rotate(-time * 1.25);
    ctx.strokeStyle = pal.mid;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 12, 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 12, -0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Music reactive equalizer arc
    if (isDancing) {
      ctx.save();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16 + time;
        const amp = 4 + Math.abs(Math.sin(time * 10 + i * 0.9)) * 7;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 23, Math.sin(a) * 23);
        ctx.lineTo(Math.cos(a) * (23 + amp), Math.sin(a) * (23 + amp));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Translucent glass core sphere
    const sphereR = 17.5 * breathe;
    const sg = ctx.createRadialGradient(-5, -6, 2, 0, 0, sphereR);
    sg.addColorStop(0, '#FFFFFF');
    sg.addColorStop(0.35, pal.core);
    sg.addColorStop(0.8, pal.mid);
    sg.addColorStop(1, 'rgba(12, 16, 28, 0.85)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, sphereR, 0, Math.PI * 2);
    ctx.fill();

    // Inner rotating neural crystal filaments
    ctx.save();
    ctx.rotate(time * 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const nx = Math.cos(a) * 10.5;
      const ny = Math.sin(a) * 10.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(nx, ny, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Specular glass highlight
    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    ctx.beginPath();
    ctx.ellipse(-5.5, -8.5, 7.5, 3.6, -0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // 4. CORAL — ORIGINAL BIOLUMINESCENT STYLIZED REEF / KOI COMPANION
  // =========================================================================
  function drawCoral(cx, cy) {
    const pal = CORAL_SKINS[st.skin] || CORAL_SKINS.tangerine;
    const s = st.scale;
    const isDancing = st.musicPlaying || forceDanceTimer > 0;
    const tailWag = Math.sin(swimPhase * (isDancing ? 1.8 : 1.0)) * (isDancing ? 10 : 6.5);

    if (isDancing) drawBeatRings(cx, cy + 26 * s, s, true);
    if (st.isThinking) drawThinkingHalo(cx, cy, s);

    ctx.save();
    ctx.translate(cx, cy);
    applyElasticSquish();

    // Soft underwater shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.ellipse(0, 26 * s, 28 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(clamp(st.pitch * 0.7, -0.3, 0.3) + (isDancing ? Math.sin(time * 9) * 0.12 : 0));
    ctx.scale(st.facingScale * s, s);

    // Translucent flowing double-ribbon tail fin (original koi/reef silhouette!)
    ctx.save();
    const tailGrad = ctx.createLinearGradient(-16, 0, -44, 0);
    tailGrad.addColorStop(0, pal.mid);
    tailGrad.addColorStop(0.55, pal.fin);
    tailGrad.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
    ctx.fillStyle = tailGrad;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.bezierCurveTo(-28, -20 + tailWag * 0.7, -42, -16 + tailWag, -38, -2 + tailWag * 0.5);
    ctx.bezierCurveTo(-42, 14 + tailWag, -28, 20 + tailWag * 0.7, -18, 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Flowing luminous dorsal ribbon crest
    ctx.fillStyle = pal.fin;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.quadraticCurveTo(0, -28 + Math.sin(swimPhase) * 2.5, 12, -14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Smooth plump iridescent fish body
    const bg = ctx.createLinearGradient(0, -18, 0, 18);
    bg.addColorStop(0, pal.top);
    bg.addColorStop(0.6, pal.mid);
    bg.addColorStop(1, pal.belly);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(2, 0, 26, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Original organic koi / bioluminescent reef spots (NOT clownfish stripes!)
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = pal.spot;
    ctx.beginPath();
    ctx.ellipse(-6, -5, 7.5, 5.0, -0.3, 0, Math.PI * 2);
    ctx.ellipse(6, -8, 4.5, 3.2, 0.2, 0, Math.PI * 2);
    ctx.ellipse(-14, 3, 4.0, 2.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Specular glossy highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.beginPath();
    ctx.ellipse(3, -9.5, 13, 3.5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Fluttering pectoral side fin
    ctx.save();
    ctx.translate(2, 6);
    ctx.rotate(0.25 + Math.sin(swimPhase * 1.4) * 0.35);
    ctx.fillStyle = pal.fin;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(-4, 5, 8.5, 4.8, 0.3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Cute expressive eye + rosy cheek + gentle smile
    const isHappy = happyTimer > 0 || isDancing;
    ctx.fillStyle = 'rgba(255, 120, 150, 0.45)';
    ctx.beginPath();
    ctx.ellipse(16, 4.5, 4.2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isHappy) {
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(16, -2, 4.4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      const eh = Math.max(0.8, 5.2 * (1 - blinkAmount * 0.92));
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.ellipse(16, -2.5, 5.2, eh, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (blinkAmount < 0.5) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(17.5, -2.5, 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(18.6, -3.8, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sweet smile
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(22.5, 2.8, 3.6, 0.25 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const prog = p.life / p.maxLife;
      const alpha = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      if (p.kind === 'bubble') {
        const r = p.r * (0.85 + prog * 0.35);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(210, 245, 255, 0.24)';
        ctx.fill();
        ctx.strokeStyle = p.tint;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.32, p.y - r * 0.32, Math.max(0.8, r * 0.26), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        const r = p.r * (1 - prog * 0.45);
        ctx.fillStyle = p.tint || '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'note') {
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(time * 5 + p.wobble) * 0.25);
        ctx.font = `700 ${Math.round(p.r)}px "Segoe UI Symbol", sans-serif`;
        ctx.fillStyle = p.tint || '#38BDF8';
        ctx.shadowColor = p.tint || '#38BDF8';
        ctx.shadowBlur = 7;
        ctx.fillText(p.glyph || '♪', 0, 0);
      } else if (p.kind === 'heart') {
        const s = p.r * (0.9 + prog * 0.25);
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.tint;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.35);
        ctx.bezierCurveTo(s * 0.7, -s * 0.35, s * 1.15, s * 0.45, 0, s * 1.1);
        ctx.bezierCurveTo(-s * 1.15, s * 0.45, -s * 0.7, -s * 0.35, 0, s * 0.35);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  let last = performance.now();
  let accum = 0;

  function loop(now) {
    const rawDt = Math.min(0.08, (now - last) / 1000);
    last = now;
    accum += rawDt;

    const isDancingNow = st.musicPlaying || forceDanceTimer > 0;
    const targetStep = st.speed < 12 && st.mode === 'stay' && excitedTimer <= 0 && happyTimer <= 0 && !st.isThinking && !isDancingNow ? 1 / 20 : 1 / 36;
    if (accum < targetStep) {
      requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(0.06, accum);
    accum = 0;
    time += dt;

    if (excitedTimer > 0) excitedTimer = Math.max(0, excitedTimer - dt);
    if (happyTimer > 0) happyTimer = Math.max(0, happyTimer - dt);
    if (forceDanceTimer > 0) forceDanceTimer = Math.max(0, forceDanceTimer - dt);
    if (coreClickPulse > 0) coreClickPulse = Math.max(0, coreClickPulse - dt * 1.9);
    if (wiggleBoost > 0) wiggleBoost = Math.max(0, wiggleBoost - dt * 1.4);
    if (tetherBurstTimer > 0) tetherBurstTimer = Math.max(0, tetherBurstTimer - dt);

    if (isDancingNow) {
      noteTimer -= dt;
      if (noteTimer <= 0) {
        spawnMusicNote(st.character === 'coral');
        noteTimer = 0.65 + Math.random() * 0.55;
      }
    }

    waveCycleTimer -= dt;
    if (waveCycleTimer <= 0) waveCycleTimer = 6.5 + Math.random() * 4.5;

    st.facingScale = lerp(st.facingScale, st.facing, Math.min(1, dt * 8.5));
    const freq = 4.6 + st.speed * 0.048 + wiggleBoost * 7.5 + (excitedTimer > 0 ? 3.2 : 0);
    swimPhase += freq * dt;

    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      if (blinkTimer > -0.14) blinkAmount = Math.sin(((0 - blinkTimer) / 0.14) * Math.PI);
      else { blinkAmount = 0; blinkTimer = 3.0 + Math.random() * 3.8; }
    }

    if (st.character === 'coral') {
      bubbleTimer -= dt * (st.mode === 'fast' ? 2.6 : excitedTimer > 0 ? 1.8 : 0.9);
      if (bubbleTimer <= 0) {
        spawnBubble();
        bubbleTimer = 0.85 + Math.random() * 1.3;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(time * 5 + p.wobble) * 10) * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.4, dt);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawParticles();

    if (st.character === 'vesper') {
      drawVesper(W * 0.5, H * 0.56);
    } else if (st.character === 'vector') {
      drawVector(W * 0.5, H * 0.54);
    } else if (st.character === 'core') {
      drawCore(W * 0.5, H * 0.52);
    } else {
      const hoverAmp = st.speed < 25 ? 4.2 : 1.8;
      const hoverY = Math.sin(time * 2.5) * hoverAmp + (excitedTimer > 0 ? Math.sin(time * 11) * 2.4 : 0);
      drawCoral(W * 0.5, H * 0.55 + hoverY);
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
