(function () {
  const api = window.petFishAPI;
  const hud = document.getElementById('hud');

  const SKIN_CATALOG = {
    kronos: [
      { id: 'titanium', label: 'Brushed Titanium', color: '#94a3b8' },
      { id: 'obsidian', label: 'Obsidian Slab', color: '#18181b' },
      { id: 'signal', label: 'Field Orange', color: '#ff5500' },
      { id: 'brass', label: 'Lunar Brass', color: '#ca8a04' },
    ],
    aegis: [
      { id: 'titanium', label: 'Alloy Grey', color: '#94a3b8' },
      { id: 'obsidian', label: 'Carbon Mech', color: '#18181b' },
      { id: 'signal', label: 'Signal Orange', color: '#ff5500' },
      { id: 'brass', label: 'Industrial Gold', color: '#ca8a04' },
    ],
    optix: [
      { id: 'archive', label: 'Archive Yellow', color: '#eab308' },
      { id: 'lab', label: 'Lab Ceramic', color: '#e2e8f0' },
      { id: 'olive', label: 'Field Recon', color: '#65a30d' },
      { id: 'cobalt', label: 'Telemetry Blue', color: '#2563eb' },
    ],
    orbit: [
      { id: 'ceramic', label: 'Ceramic White', color: '#f2efe9' },
      { id: 'carbon', label: 'Stealth Carbon', color: '#27272a' },
      { id: 'phosphor', label: 'Phosphor Terminal', color: '#10b981' },
      { id: 'crimson', label: 'Core Red', color: '#e11d48' },
    ],
  };

  const COMPANION_META = {
    kronos: { slug: 'kronos', group: 'Robot', skins: 4, desc: 'Interstellar 4-slab articulated monolith robot built for heavy tasks, builds, and terminal execution.', move: '4-SLAB STRIDE' },
    aegis: { slug: 'aegis', group: 'Robot', skins: 4, desc: 'Compact bipedal field-engineering mech with rotary dial telemetry and expressive OLED visor.', move: 'BIPEDAL SERVO' },
    optix: { slug: 'optix', group: 'Robot', skins: 4, desc: 'Tracked binocular research rover built for deep codebase indexing and synthesis.', move: 'OPTICAL SCAN' },
    orbit: { slug: 'orbit', group: 'Robot', skins: 4, desc: 'Zero-G magnetic synth pod designed for multi-agent orchestration and live timers.', move: 'MAGNETIC DRONE' },
  };

  const state = {
    viewMode: 'mini',
    settings: {
      displayMode: 'floating',
      wakeOnAlerts: true,
      showAlertBubbles: true,
      privacyMask: false,
      voiceEnabled: true,
      selectedVoice: 'arjun',
      bgmEnabled: true,
      danceModeEnabled: false,
      autoStart: false,
      thinkMode: false,
      ageGroup: '15-30',
      glassTransparency: 0,
      fishScale: 1.06,
      petMode: 'swim',
      petCharacter: 'kronos',
      unresolvedCharacter: null,
      petSkins: { kronos: 'titanium', aegis: 'titanium', optix: 'archive', orbit: 'ceramic' },
      petNames: { kronos: 'Kronos', aegis: 'Aegis', optix: 'Optix', orbit: 'Orbit' },
    },
    petMode: 'swim',
    petCharacter: 'kronos',
    customHeroes: [],
    activePersona: null,
    agents: [],
    notifications: [],
    approvals: [],
    autoPilot: { rules: { autoAllowReadOnly: false, autoDenyDangerous: true }, tasks: [], reminders: [], focusStats: { xp: 0, level: 1, streakDays: 1 }, timer: null, log: [] },
    llm: { models: [], selectedModel: null, activeLabel: 'qwen3.5:2b', isThinking: false, thinkMode: false, history: [] },
    discovery: { recentDiscoveries: [], installedAgents: [] },
    sys: { wifiOn: true, bluetoothOn: true, flightMode: false, connectedSsid: '', signalPct: 0, wifiNetworks: [], bluetoothDevices: [] },
    music: { isPlaying: false, title: '', artist: '', source: '', bgmLoopActive: false },
    clipboard: [],
    mobile: { running: false, tunnelRunning: false, tunnelUrl: '', tunnelStatus: 'Stopped', qrSvg: '', pairingPin: null },
    startAppsCount: 0,
    pulse: { windows: [], ports: [], vitals: { sysRamPct: 0, appRamMB: 0 } },
    claudeHooks: { installed: false },
    hookPort: 47821,
    activeTab: 'agents',
    libFilter: 'all',
    notifFilter: 'all',
    activeDrawer: null,
    expandedIdleAgents: new Set(),
    editingTaskId: null,
    pinned: false,
    lastMiniAi: null,
  };

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeColor(color, fallback = '#60a5fa') {
    const s = String(color || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 12) return 'Now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function formatElapsed(startTs) {
    if (!startTs) return '0s';
    const secs = Math.max(0, Math.floor((Date.now() - startTs) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  function formatCountdown(ms) {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  function getCharName(ch) {
    const c = ch || state.petCharacter || 'kronos';
    const custom = (state.customHeroes || []).find((h) => h.id === c);
    if (custom) return state.settings.petNames?.[c] || custom.nickname || custom.name || 'Custom Bot';
    return state.settings.petNames?.[c] || { kronos: 'Kronos', aegis: 'Aegis', optix: 'Optix', orbit: 'Orbit' }[c] || 'Kronos';
  }

  function formatClockTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function getAgentPalette(agent) {
    const n = String(agent?.name || '').toLowerCase();
    if (n.includes('antigravity')) return { main: '#38bdf8', dark: '#0369a1', vibe: 'building...' };
    if (n.includes('claude')) return { main: '#f59e0b', dark: '#b45309', vibe: 'reasoning...' };
    if (n.includes('ollama')) return { main: '#34d399', dark: '#047857', vibe: 'local tokens...' };
    if (n.includes('lm studio')) return { main: '#c084fc', dark: '#7e22ce', vibe: 'serving model...' };
    if (n.includes('codex')) return { main: '#fb7185', dark: '#be123c', vibe: 'sandbox...' };
    return { main: safeColor(agent?.accent, '#60a5fa'), dark: '#1d4ed8', vibe: 'working...' };
  }

  function renderAgentMascotSvg(pal, charKey) {
    if (charKey === 'nemo') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><path d="M8 14C5 9.5 2.5 10.5 3 14C2.5 17.5 5 18.5 8 14Z" fill="#2dd4bf"/><ellipse cx="16.5" cy="14" rx="8" ry="5.5" fill="${pal.main}"/><circle cx="14.2" cy="12.5" r="2" fill="#fff" opacity="0.85"/><circle cx="20.6" cy="12.8" r="1.3" fill="#0b1324"/></svg>`;
    }
    if (charKey === 'batman') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><polygon points="5,12 9,8 19,8 23,12 20,20 14,23 8,20" fill="#1e293b" stroke="${pal.main}" stroke-width="1.2"/><rect x="8.5" y="12" width="11" height="4.5" rx="2" fill="#090d16"/><rect x="10" y="13.4" width="3.2" height="1.5" fill="#7dd3fc"/><rect x="14.8" y="13.4" width="3.2" height="1.5" fill="#7dd3fc"/></svg>`;
    }
    if (charKey === 'ironman') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><polygon points="9,5 19,5 23,13 20,23 8,23 5,13" fill="${pal.main}"/><rect x="8" y="10" width="12" height="6" rx="2.5" fill="#0b1120"/><rect x="9.6" y="12" width="3.2" height="2" rx="1" fill="#38bdf8"/><rect x="15.2" y="12" width="3.2" height="2" rx="1" fill="#38bdf8"/></svg>`;
    }
    return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9.5" fill="${pal.main}" stroke="${pal.dark}" stroke-width="1.2"/><rect x="7.5" y="10" width="13" height="7" rx="3.5" fill="#0b1120"/><circle cx="11.5" cy="13.5" r="1.7" fill="#fff"/><circle cx="16.5" cy="13.5" r="1.7" fill="#fff"/></svg>`;
  }

  function applyGlassTransparency(pct) {
    const t = Math.max(0, Math.min(100, Number(pct ?? 42)));
    // 0% = 0.97 solid matte -> 100% = 0.56 ultra-liquid crystal glass!
    const alpha = +(0.97 - (t / 100) * 0.41).toFixed(3);
    const blur = Math.round(14 + (t / 100) * 34);
    document.documentElement.style.setProperty('--glass-alpha', String(alpha));
    document.documentElement.style.setProperty('--glass-blur', `${blur}px`);
    const lbl = document.getElementById('trans-label');
    if (lbl) {
      const tag = t < 20 ? 'Solid' : t < 65 ? 'Frosted' : 'Liquid';
      lbl.textContent = `${tag} (${t}%)`;
    }
  }

  function applyViewMode(mode, tab) {
    state.viewMode = mode === 'deep' ? 'deep' : 'mini';
    document.body.classList.toggle('mode-mini', state.viewMode === 'mini');
    document.body.classList.toggle('mode-deep', state.viewMode === 'deep');
    if (tab) switchTab(tab);
    render();
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${tab}`));
  }

  function applyFullState(data) {
    if (!data) return;
    if (data.hudViewMode) {
      state.viewMode = data.hudViewMode;
      document.body.classList.toggle('mode-mini', state.viewMode === 'mini');
      document.body.classList.toggle('mode-deep', state.viewMode === 'deep');
    }
    if (data.settings) {
      state.settings = {
        ...state.settings,
        ...data.settings,
        petSkins: { ...state.settings.petSkins, ...(data.settings.petSkins || {}) },
        petNames: { ...state.settings.petNames, ...(data.settings.petNames || {}) },
      };
    }
    if (data.petMode) state.petMode = data.petMode;
    if (data.petCharacter) state.petCharacter = data.petCharacter;
    if (Array.isArray(data.customHeroes)) state.customHeroes = data.customHeroes;
    if (data.activePersona) state.activePersona = data.activePersona;
    if (Array.isArray(data.agents)) state.agents = data.agents;
    if (Array.isArray(data.notifications)) state.notifications = data.notifications;
    if (Array.isArray(data.approvals)) state.approvals = data.approvals;
    if (data.autoPilot) state.autoPilot = data.autoPilot;
    if (data.llm) state.llm = data.llm;
    if (data.discovery) state.discovery = data.discovery;
    if (data.sys) state.sys = data.sys;
    if (data.music) state.music = data.music;
    if (Array.isArray(data.clipboard)) state.clipboard = data.clipboard;
    if (data.mobile) state.mobile = data.mobile;
    if (typeof data.startAppsCount === 'number') state.startAppsCount = data.startAppsCount;
    if (data.pulse) state.pulse = data.pulse;
    if (data.claudeHooks) state.claudeHooks = data.claudeHooks;
    if (data.hookPort) state.hookPort = data.hookPort;
    render();
  }

  function showCommandFeedback(msg) {
    const el = document.getElementById('cmd-feedback');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function renderTimersOnly() {
    document.querySelectorAll('[data-elapsed-start]').forEach((el) => {
      const ts = Number(el.dataset.elapsedStart);
      if (ts) el.textContent = formatElapsed(ts);
    });
    const t = state.autoPilot?.timer;
    const disp = document.getElementById('sprint-display');
    const stopBtn = document.getElementById('btn-sprint-stop');
    if (disp && t && t.endAt > Date.now()) {
      disp.textContent = formatCountdown(t.endAt - Date.now());
      stopBtn.classList.remove('hidden');
    } else if (disp) {
      disp.textContent = '25:00';
      stopBtn.classList.add('hidden');
    }
  }

  function renderSystemControls() {
    const s = state.sys || {};
    const wifiOn = Boolean(s.wifiOn);
    const btOn = Boolean(s.bluetoothOn);
    const flightOn = Boolean(s.flightMode);
    const connectedBt = (s.bluetoothDevices || []).find((d) => d.connected);

    const miniWifi = document.getElementById('mini-btn-wifi');
    const miniBt = document.getElementById('mini-btn-bt');
    const miniFlight = document.getElementById('mini-btn-flight');
    if (miniWifi) { miniWifi.classList.toggle('on', wifiOn); document.getElementById('mini-wifi-sub').textContent = wifiOn ? (s.connectedSsid || 'On') : 'Off'; }
    if (miniBt) { miniBt.classList.toggle('on', btOn); document.getElementById('mini-bt-sub').textContent = btOn ? (connectedBt ? connectedBt.name : 'On') : 'Off'; }
    if (miniFlight) { miniFlight.classList.toggle('on', flightOn); document.getElementById('mini-flight-sub').textContent = flightOn ? 'Active' : 'Off'; }

    const tileWifi = document.getElementById('cc-tile-wifi');
    const tileBt = document.getElementById('cc-tile-bt');
    const tileFlight = document.getElementById('cc-tile-flight');
    if (tileWifi) {
      tileWifi.classList.toggle('on', wifiOn);
      document.getElementById('cc-wifi-badge').textContent = wifiOn ? 'ON' : 'OFF';
      document.getElementById('cc-wifi-sub').textContent = wifiOn ? (s.connectedSsid ? `${s.connectedSsid}${s.signalPct ? ` · ${s.signalPct}%` : ''}` : 'Not connected') : 'Off';
    }
    if (tileBt) {
      tileBt.classList.toggle('on', btOn);
      document.getElementById('cc-bt-badge').textContent = btOn ? 'ON' : 'OFF';
      document.getElementById('cc-bt-sub').textContent = btOn ? (connectedBt ? connectedBt.name : `${(s.bluetoothDevices || []).length} paired`) : 'Off';
    }
    if (tileFlight) {
      tileFlight.classList.toggle('on', flightOn);
      document.getElementById('cc-flight-badge').textContent = flightOn ? 'ON' : 'OFF';
      document.getElementById('cc-flight-sub').textContent = flightOn ? 'Radios off' : 'Normal';
    }

    document.getElementById('cc-wifi-drawer').classList.toggle('hidden', state.activeDrawer !== 'wifi');
    document.getElementById('cc-bt-drawer').classList.toggle('hidden', state.activeDrawer !== 'bt');
    document.getElementById('btn-drawer-wifi').classList.toggle('active', state.activeDrawer === 'wifi');
    document.getElementById('btn-drawer-bt').classList.toggle('active', state.activeDrawer === 'bt');

    if (state.activeDrawer === 'wifi') {
      const nets = s.wifiNetworks || [];
      document.getElementById('cc-wifi-list').innerHTML = nets.length === 0
        ? `<span class="section-meta">No Wi-Fi profiles found.</span>`
        : nets.map((n) => `
          <div class="cc-net-row ${n.connected ? 'connected' : ''}">
            <div class="cc-net-info"><span class="agent-dot" style="background:${n.connected ? '#30d158' : 'var(--accent)'}"></span><div><div class="cc-net-name">${escapeHtml(n.ssid)}</div><div class="cc-net-meta">${n.connected ? 'Connected' : n.saved ? 'Saved' : 'Password'}${n.signal ? ` · ${n.signal}%` : ''}</div></div></div>
            ${n.connected ? `<button class="mini-btn" data-wifi-disconnect="1" type="button">Disconnect</button>` : `<button class="mini-btn primary" data-wifi-connect="${escapeHtml(n.ssid)}" type="button">Connect</button>`}
          </div>`).join('');
    }
    if (state.activeDrawer === 'bt') {
      const devs = s.bluetoothDevices || [];
      document.getElementById('cc-bt-list').innerHTML = devs.length === 0
        ? `<span class="section-meta">No paired Bluetooth devices.</span>`
        : devs.map((d) => `
          <div class="cc-net-row ${d.connected ? 'connected' : ''}">
            <div class="cc-net-info"><span class="agent-dot" style="background:${d.connected ? '#30d158' : 'var(--accent-2)'}"></span><div><div class="cc-net-name">${escapeHtml(d.name)}</div><div class="cc-net-meta">${d.connected ? 'Connected' : 'Paired'}</div></div></div>
            <button class="mini-btn ${d.connected ? '' : 'primary'}" data-bt-mac="${escapeHtml(d.mac)}" data-bt-connect="${d.connected ? '0' : '1'}" type="button">${d.connected ? 'Disconnect' : 'Connect'}</button>
          </div>`).join('');
    }

    const appsMeta = document.getElementById('apps-indexed-meta');
    if (appsMeta) appsMeta.textContent = state.startAppsCount > 0 ? `${state.startAppsCount} PC Apps + Web` : 'PC Apps + Web';
  }

  function render() {
    const rawChar = state.petCharacter || 'kronos';
    const activeCustom = (state.customHeroes || []).find((h) => h.id === rawChar) || null;
    const ch = activeCustom ? 'custom' : (['kronos', 'aegis', 'optix', 'orbit'].includes(rawChar) ? rawChar : 'kronos');
    document.body.dataset.theme = ch;
    if (activeCustom) {
      document.documentElement.style.setProperty('--accent', safeColor(activeCustom.primaryColor, '#6366f1'));
      document.documentElement.style.setProperty('--accent-2', safeColor(activeCustom.secondaryColor, '#0ea5e9'));
      document.documentElement.style.setProperty('--accent-soft', 'rgba(99, 102, 241, 0.16)');
      document.documentElement.style.setProperty('--accent-border', 'rgba(99, 102, 241, 0.42)');
      document.documentElement.style.setProperty('--accent-text', '#e0e7ff');
    } else {
      ['--accent', '--accent-2', '--accent-soft', '--accent-border', '--accent-text'].forEach((k) => document.documentElement.style.removeProperty(k));
    }
    applyGlassTransparency(state.settings.glassTransparency);

    const activeAgents = state.agents.filter((a) => a.status === 'running' || a.status === 'waiting_approval');
    const unread = state.notifications.filter((n) => n.unread);
    const ramMB = state.pulse?.vitals?.appRamMB || 0;
    const activeName = getCharName(rawChar);

    document.getElementById('header-pill').textContent = ramMB > 0 ? `${ramMB} MB` : 'Lean';
    document.getElementById('hud-subtitle').textContent =
      state.viewMode === 'deep'
        ? `${activeName} · ${state.llm?.activeLabel || 'Local AI'}`
        : `${activeName} · ${activeAgents.length} active`;

    // Sync custom character names across Mini strip & Studio cards
    document.querySelectorAll('.char-chip').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.char === rawChar);
      btn.textContent = getCharName(btn.dataset.char);
    });
    document.querySelectorAll('.pet-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.char === rawChar);
    });
    document.querySelectorAll('[data-char-label]').forEach((el) => {
      el.textContent = getCharName(el.dataset.charLabel);
    });
    document.getElementById('studio-active-label').textContent = activeName;
    const renameInp = document.getElementById('rename-input');
    if (document.activeElement !== renameInp) renameInp.value = activeName;

    // Update Mini Companion Bar & Active Companion Showcase
    const meta = COMPANION_META[ch] || { slug: 'vesper', group: 'Custom', skins: 1, desc: activeCustom?.personality || 'Custom companion created in Companion Studio.', move: activeCustom?.movement || 'Custom' };
    const artSrc = activeCustom?.artworkDataUrl || `../../docs/posters/pet-${meta.slug}.png`;
    const miniImg = document.getElementById('mini-companion-img');
    const miniName = document.getElementById('mini-companion-name');
    const miniMeta = document.getElementById('mini-companion-meta');
    if (miniImg) miniImg.src = artSrc;
    if (miniName) miniName.textContent = activeName;
    if (miniMeta) miniMeta.textContent = `${meta.group} Companion · ${meta.move}`;

    const showImg = document.getElementById('studio-showcase-img');
    const showBadge = document.getElementById('studio-active-badge');
    const showDesc = document.getElementById('studio-active-desc');
    const showMove = document.getElementById('studio-active-move');
    if (showImg) showImg.src = artSrc;
    if (showBadge) showBadge.textContent = activeCustom ? 'Custom' : `${meta.group} · ${meta.skins} skins`;
    if (showDesc) showDesc.textContent = activeCustom?.personality || meta.desc;
    if (showMove) showMove.textContent = `Movement: ${meta.move}`;

    // Filter Companion Library Grid
    document.querySelectorAll('[data-lib-filter]').forEach((b) => b.classList.toggle('active', b.dataset.libFilter === state.libFilter));
    document.querySelectorAll('#lib-grid .pet-card').forEach((card) => {
      const grp = card.dataset.group || 'hero';
      const show = state.libFilter === 'all' || state.libFilter === grp;
      card.classList.toggle('hidden', !show);
    });

    renderSystemControls();

    // Mini View Cards
    const appSlot = document.getElementById('mini-approval-slot');
    if (state.approvals.length > 0) {
      const topApp = state.approvals[0];
      appSlot.classList.remove('hidden');
      appSlot.innerHTML = `<div class="mini-pulse-card urgent"><div class="mini-pulse-top"><span class="mini-pulse-label"><span class="agent-dot" style="background:#f5a623"></span>${escapeHtml(topApp.agent)} · ${escapeHtml(topApp.toolName)}</span><span class="section-meta">${state.approvals.length} pending</span></div><div class="mini-pulse-text">${escapeHtml(topApp.detail || topApp.title)}</div><div class="card-actions" style="margin-top:3px"><button class="mini-btn allow" data-act="allow" data-id="${escapeHtml(topApp.id)}">Allow</button><button class="mini-btn deny" data-act="deny" data-id="${escapeHtml(topApp.id)}">Deny</button></div></div>`;
    } else { appSlot.classList.add('hidden'); appSlot.innerHTML = ''; }

    const pendingQuestionAgents = state.agents.filter((a) => a.pendingQuestion && a.pendingQuestion.question);
    const qSlot = document.getElementById('mini-question-slot');
    if (qSlot) {
      if (pendingQuestionAgents.length > 0) {
        const qa = pendingQuestionAgents[0];
        const q = qa.pendingQuestion;
        const optsHtml = Array.isArray(q.options) && q.options.length > 0
          ? `<div class="question-options">${q.options.map((o, i) => `<span class="question-opt-pill">${i + 1}. ${escapeHtml(o)}</span>`).join('')}</div>`
          : '';
        qSlot.classList.remove('hidden');
        qSlot.innerHTML = `
          <div class="question-card">
            <div class="question-head">
              <span class="question-badge"><span class="agent-dot" style="background:#f5a623"></span>${escapeHtml(qa.name.toUpperCase())} // ${q.kind === 'approval' ? 'PERMISSION' : 'ASKING YOU'}</span>
              <span class="section-meta">${escapeHtml(q.toolName || 'Question')}</span>
            </div>
            <div class="question-text">${escapeHtml(q.question)}</div>
            ${optsHtml}
            <div class="card-actions" style="margin-top:2px">
              <button class="mini-btn primary" data-focus="${escapeHtml(qa.processHint || qa.name)}" type="button">OPEN ${escapeHtml(qa.name.toUpperCase())}</button>
              <button class="mini-btn" data-copy-raw="${escapeHtml(q.question)}" type="button">COPY</button>
              <button class="mini-btn" data-speak-raw="${escapeHtml(`${qa.name} asks: ${q.question}`)}" type="button">SPEAK</button>
            </div>
          </div>`;
      } else {
        qSlot.classList.add('hidden');
        qSlot.innerHTML = '';
      }
    }

    const topAg = activeAgents[0] || state.agents[0];
    if (topAg) {
      document.getElementById('mini-ag-dot').style.background = topAg.accent || '#38bdf8';
      document.getElementById('mini-ag-name').textContent = topAg.name;
      const metaEl = document.getElementById('mini-ag-meta');
      if (topAg.status === 'running') { metaEl.dataset.elapsedStart = String(topAg.turnStartedAt || topAg.startedAt || Date.now()); metaEl.textContent = formatElapsed(topAg.turnStartedAt || topAg.startedAt); }
      else { delete metaEl.dataset.elapsedStart; metaEl.textContent = 'Stop.'; }
      document.getElementById('mini-ag-brief').textContent = topAg.what || topAg.task || 'Ready';
    } else {
      document.getElementById('mini-ag-name').textContent = 'Agents';
      document.getElementById('mini-ag-meta').textContent = 'Idle';
      document.getElementById('mini-ag-brief').textContent = 'Press A+S+D anytime to wake saved AI chat.';
    }

    const alertCard = document.getElementById('mini-alert-card');
    const latestAlert = unread[0] || state.notifications[0];
    const showAiBox = Boolean(state.llm?.isThinking || state.lastMiniAi);
    if (latestAlert && !showAiBox) {
      alertCard.classList.remove('hidden');
      document.getElementById('mini-al-dot').style.background = latestAlert.accent || '#25d366';
      document.getElementById('mini-al-app').textContent = `${latestAlert.appName} · ${latestAlert.title}`;
      document.getElementById('mini-al-time').textContent = formatRelativeTime(latestAlert.timestamp);
      document.getElementById('mini-al-body').textContent = latestAlert.body || 'Click to open ↗';
    } else alertCard.classList.add('hidden');

    const aiBox = document.getElementById('mini-ai-reply');
    if (state.llm?.isThinking) {
      aiBox.classList.remove('hidden');
      document.getElementById('mini-ai-model').textContent = state.llm.activeLabel || 'AI';
      document.getElementById('mini-ai-action').textContent = state.settings.thinkMode ? 'deep thinking...' : 'thinking...';
      document.getElementById('mini-ai-text').textContent = '▍ processing locally...';
    } else if (state.lastMiniAi) {
      aiBox.classList.remove('hidden');
      document.getElementById('mini-ai-model').textContent = state.lastMiniAi.model || state.llm.activeLabel || 'AI';
      document.getElementById('mini-ai-action').textContent = state.lastMiniAi.actionNote || '';
      document.getElementById('mini-ai-text').textContent = state.lastMiniAi.reply;
    } else aiBox.classList.add('hidden');

    // Badges
    const tabAgentsBadge = document.getElementById('tab-badge-agents');
    const attentionCount = state.approvals.length + pendingQuestionAgents.length;
    const agentBadgeCount = attentionCount || activeAgents.length;
    tabAgentsBadge.textContent = String(agentBadgeCount);
    tabAgentsBadge.classList.toggle('hidden', agentBadgeCount === 0);
    tabAgentsBadge.classList.toggle('urgent', attentionCount > 0);

    const tabAlertsBadge = document.getElementById('tab-badge-alerts');
    tabAlertsBadge.textContent = String(unread.length);
    tabAlertsBadge.classList.toggle('hidden', unread.length === 0);

    // Approvals (Deep Dive)
    const appSection = document.getElementById('approvals-section');
    const appList = document.getElementById('approvals-list');
    if (state.approvals.length > 0) {
      appSection.classList.remove('hidden');
      document.getElementById('approvals-count-label').textContent = `${state.approvals.length} pending`;
      appList.innerHTML = state.approvals.map((a) => `
        <div class="card approval-card">
          <div class="card-top"><div class="card-title-wrap"><span class="agent-dot" style="background:#f5a623"></span><span class="card-name">${escapeHtml(a.agent)} · ${escapeHtml(a.toolName)}</span></div><span class="section-meta">${formatRelativeTime(a.createdAt)}</span></div>
          <div class="card-task">${escapeHtml(a.title)}</div>
          ${a.detail ? `<div class="code-snippet">${escapeHtml(a.detail)}</div>` : ''}
          <div class="card-foot"><span>${a.canRespondDirectly ? 'Direct hook' : 'Focus'}</span><div class="card-actions"><button class="mini-btn allow" data-act="allow" data-id="${escapeHtml(a.id)}">Allow</button><button class="mini-btn deny" data-act="deny" data-id="${escapeHtml(a.id)}">Deny</button></div></div>
        </div>`).join('');
    } else { appSection.classList.add('hidden'); appList.innerHTML = ''; }

    // Discovery
    const discSec = document.getElementById('discovery-section');
    const discs = state.discovery?.recentDiscoveries || [];
    if (discs.length > 0) {
      discSec.classList.remove('hidden');
      document.getElementById('discovery-chips').innerHTML = discs.slice(0, 4).map((d) => `<span class="micro-chip new-app">${d.isAgent ? 'AI' : 'APP'}: ${escapeHtml(d.name)}</span>`).join('');
    } else discSec.classList.add('hidden');

    const runningAgents = state.agents.filter((a) => a.status === 'running' || a.status === 'waiting_approval');
    const stoppedAgents = state.agents.filter((a) => a.status !== 'running' && a.status !== 'waiting_approval');
    document.getElementById('agents-meta').textContent = `${runningAgents.length} ACTIVE · ${stoppedAgents.length} IDLE`;

    document.getElementById('agents-list').innerHTML = runningAgents.length === 0
      ? `<div class="empty-state">No active agents detected. Start Antigravity or Claude Code — ${escapeHtml(activeName)} will announce start time &amp; show a live head timer.</div>`
      : runningAgents.map((ag) => {
          const pal = getAgentPalette(ag);
          const elapsedStart = ag.turnStartedAt || ag.startedAt || Date.now();
          const startClock = formatClockTime(elapsedStart);
          const pct = ag.stepsProgress ? Math.round((ag.stepsProgress.done / Math.max(1, ag.stepsProgress.total)) * 100) : 0;
          const pq = ag.pendingQuestion;
          const copySummary = pq
            ? `${ag.name} QUESTION: ${pq.question}`
            : `${ag.name} (${ag.status.toUpperCase()}) | STARTED ${startClock} | WHAT: ${ag.what || ag.task || 'Active'} | HOW: ${ag.how || ''}`;
          const questionHtml = pq && pq.question
            ? `<div class="question-card" style="margin-top:2px">
                <div class="question-head">
                  <span class="question-badge">${escapeHtml((pq.title || 'QUESTION / REQUEST').toUpperCase())}</span>
                  <span class="section-meta">${escapeHtml(pq.toolName || 'Prompt')}</span>
                </div>
                <div class="question-text">${escapeHtml(pq.question)}</div>
                ${Array.isArray(pq.options) && pq.options.length > 0 ? `<div class="question-options">${pq.options.map((o, i) => `<span class="question-opt-pill">${i + 1}. ${escapeHtml(o)}</span>`).join('')}</div>` : ''}
                <div class="card-actions" style="margin-top:2px">
                  <button class="mini-btn primary" data-focus="${escapeHtml(ag.processHint || ag.name)}" type="button">OPEN ${escapeHtml(ag.name.toUpperCase())}</button>
                  <button class="mini-btn" data-speak-raw="${escapeHtml(`${ag.name} asks: ${pq.question}`)}" type="button">SPEAK</button>
                </div>
              </div>`
            : '';
          const statusTagHtml = pq
            ? `<span class="status-tag waiting_approval"><span class="status-dot"></span>ASKING</span>`
            : `<span class="status-tag running"><span class="status-dot"></span>ON</span>`;
          return `
          <div class="card">
            <div class="card-top">
              <div class="card-title-wrap">
                <span class="agent-dot" style="background:${pal.main}"></span>
                <span class="card-name">${escapeHtml(ag.name)}</span>
              </div>
              <div class="card-right-meta">
                ${startClock ? `<span class="section-meta">START ${escapeHtml(startClock)}</span>` : ''}
                <span class="elapsed-pill" data-elapsed-start="${elapsedStart}">${formatElapsed(elapsedStart)}</span>
                ${statusTagHtml}
              </div>
            </div>
            ${questionHtml}
            <div class="brief-box">
              <div class="brief-row"><span class="brief-key">WHAT</span><span class="brief-val">${escapeHtml((ag.what || ag.task || 'Active').slice(0, 320))}</span></div>
              ${ag.how ? `<div class="brief-row"><span class="brief-key">HOW</span><span class="brief-val muted">${escapeHtml(ag.how.slice(0, 220))}</span></div>` : ''}
              ${ag.why ? `<div class="brief-row"><span class="brief-key">WHY</span><span class="brief-val muted">${escapeHtml(ag.why.slice(0, 180))}</span></div>` : ''}
              ${ag.stepsProgress ? `<div class="step-bar-wrap"><div class="step-bar"><div class="step-bar-fill" style="width:${pct}%"></div></div><span class="step-bar-txt">${ag.stepsProgress.done}/${ag.stepsProgress.total}</span></div>` : ''}
            </div>
            <div class="card-foot">
              <span>${escapeHtml(pal.vibe.toUpperCase())}</span>
              <div class="card-actions">
                <button class="mini-btn" data-copy-raw="${escapeHtml(copySummary)}" type="button">COPY</button>
                <button class="mini-btn primary" data-announce-agent="${escapeHtml(ag.id)}" type="button">REPORT</button>
                <button class="mini-btn" data-focus="${escapeHtml(ag.processHint || ag.name)}" type="button">FOCUS</button>
              </div>
            </div>
          </div>`;
        }).join('');

    const idleSec = document.getElementById('idle-agents-section');
    if (stoppedAgents.length > 0) {
      idleSec.classList.remove('hidden');
      document.getElementById('idle-agents-meta').textContent = `${stoppedAgents.length}`;
      document.getElementById('idle-agents-list').innerHTML = stoppedAgents.map((ag) => {
        const exp = state.expandedIdleAgents.has(ag.id);
        return `<div><div class="idle-agent-row" data-toggle-idle="${escapeHtml(ag.id)}"><div class="idle-agent-left"><span class="agent-dot" style="background:var(--text-3)"></span><span class="idle-agent-name">${escapeHtml(ag.name)}</span><span class="idle-agent-summary">${escapeHtml((ag.what || ag.task || 'Idle').slice(0, 48))}</span></div><span class="section-meta">${exp ? 'Hide' : 'Details'}</span></div>${exp ? `<div class="idle-agent-expand"><div>${escapeHtml(ag.what || ag.task || 'Completed')}</div><div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center"><span class="section-meta">${formatRelativeTime(ag.updatedAt)}</span><button class="mini-btn" data-focus="${escapeHtml(ag.processHint || ag.name)}">Focus</button></div></div>` : ''}</div>`;
      }).join('');
    } else idleSec.classList.add('hidden');

    // Open Windows
    const wins = state.pulse?.windows || [];
    document.getElementById('windows-list').innerHTML = wins.length === 0
      ? `<div class="empty-state">No active application windows captured.</div>`
      : wins.slice(0, 5).map((w) => `<div class="window-row" data-focus="${escapeHtml(w.processName)}"><div class="window-left"><span class="window-app-tag">${escapeHtml(w.app)}</span><span class="window-title">${escapeHtml(w.title)}</span></div><span class="section-meta">Focus</span></div>`).join('');

    // Chat Tab (Saved Chat + Thinking Model + Single Named Voice Selector + Per-Message Delete)
    const select = document.getElementById('model-select');
    const models = state.llm?.models || [];
    select.innerHTML = models.length > 0
      ? models.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === (state.llm.selectedModel || models[0].id) ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')
      : `<option value="">Built-In Whisper &amp; Task Brain (Start Ollama for LLM)</option>`;

    const setupGuide = document.getElementById('llm-setup-guide');
    if (setupGuide) setupGuide.classList.toggle('hidden', models.length > 0);

    const selVoice = state.settings.selectedVoice || 'arjun';
    const voiceSel = document.getElementById('voice-select');
    if (voiceSel && voiceSel.value !== selVoice) voiceSel.value = selVoice;
    const studioVoiceSel = document.getElementById('studio-voice-select');
    if (studioVoiceSel && studioVoiceSel.value !== selVoice) studioVoiceSel.value = selVoice;

    const thinkBtn = document.getElementById('btn-think-mode');
    thinkBtn.classList.toggle('active', Boolean(state.settings.thinkMode));
    thinkBtn.textContent = state.settings.thinkMode ? 'Think' : 'Fast';
    const vToggle = document.getElementById('btn-voice-toggle');
    vToggle.classList.toggle('active', Boolean(state.settings.voiceEnabled));
    vToggle.textContent = state.settings.voiceEnabled ? 'Voice: On' : 'Voice: Off';

    const hist = state.llm?.history || [];
    const recentStart = Math.max(0, hist.length - 6);
    const visibleHist = hist.slice(recentStart);
    document.getElementById('chat-feed').innerHTML = visibleHist.length === 0 && !state.llm?.isThinking
      ? `<div class="empty-state">Press <strong>A+S+D</strong> or click <strong>JARVIS MIC</strong> to speak any command (Antigravity, YouTube, folders, downloads), or type below in English, Hinglish, or Hindi.</div>`
      : visibleHist.map((m, relIdx) => {
          const idx = recentStart + relIdx;
          return `
          <div class="chat-msg ${escapeHtml(m.role)}">
            ${m.thinking ? `<details class="think-details"><summary>REASONING</summary><div style="margin-top:4px;white-space:pre-wrap">${escapeHtml(m.thinking)}</div></details>` : ''}
            <div>${escapeHtml(m.content)}</div>
            <div class="chat-foot">
              ${m.action ? `<span class="chat-action-pill">${escapeHtml(m.action.type)}</span>` : '<span></span>'}
              <div style="display:flex;gap:8px;align-items:center">
                <button class="link-btn" data-copy-idx="${idx}" type="button" title="Copy message text">COPY</button>
                ${m.role === 'assistant' ? `<button class="link-btn" data-speak-idx="${idx}" type="button" title="Speak with selected named voice">SPEAK</button>` : ''}
                <button class="link-btn muted" data-del-chat-idx="${idx}" type="button" title="Delete this message">DEL</button>
              </div>
            </div>
          </div>`;
        }).join('') + (state.llm?.isThinking ? `<div class="chat-msg assistant">${escapeHtml(state.llm.activeLabel)} IS PROCESSING...</div>` : '');

    // Music Player Card & Mini Popover Media Bar + Dance Mode Toggle
    const mus = state.music || {};
    const danceOn = Boolean(state.settings.danceModeEnabled);
    const trackText = mus.title || (mus.bgmLoopActive ? `${activeName} Theme Audio` : 'Not Playing');
    document.getElementById('mp-track').textContent = trackText;
    const miniTrackEl = document.getElementById('mini-mp-track');
    if (miniTrackEl) {
      miniTrackEl.textContent = mus.isPlaying
        ? `PLAYING // ${trackText.slice(0, 22)}`
        : `MEDIA // ${trackText.slice(0, 20)}`;
    }
    document.getElementById('mp-artist').textContent = mus.artist ? `${mus.artist} · ${mus.source}` : (mus.bgmLoopActive ? 'Local ambient loop active' : 'Play audio from Spotify, YouTube, or Companion Theme');
    document.getElementById('mp-source-meta').textContent = mus.isPlaying ? (mus.source || 'Playing') : (mus.bgmLoopActive ? 'Theme Audio' : 'Idle');
    const bgmBtn = document.getElementById('btn-bgm-loop');
    bgmBtn.classList.toggle('active', Boolean(mus.bgmLoopActive));
    bgmBtn.textContent = mus.bgmLoopActive ? 'Theme Audio: On' : 'Theme Audio: Off';

    for (const dBtnId of ['btn-mini-dance', 'btn-ctrl-dance', 'btn-pet-dance']) {
      const dBtn = document.getElementById(dBtnId);
      if (dBtn) {
        dBtn.classList.toggle('active', danceOn);
        dBtn.textContent = danceOn ? 'DANCE: ON' : 'DANCE: OFF';
      }
    }
    const danceSwitch = document.getElementById('toggle-dance-mode');
    if (danceSwitch) danceSwitch.checked = danceOn;

    // Clipboard Vault
    const cbs = state.clipboard || [];
    document.getElementById('clipboard-list').innerHTML = cbs.length === 0
      ? `<div class="empty-state">Copied text and code will appear here in memory.</div>`
      : cbs.slice(0, 6).map((c) => `
        <div class="cb-item">
          <span class="cb-preview" data-cb-copy="${escapeHtml(c.id)}" title="Click to copy">${escapeHtml(c.preview)}</span>
          <div class="task-actions">
            <button class="icon-btn tiny" data-cb-pin="${escapeHtml(c.id)}" type="button" title="Pin">${c.pinned ? '●' : '○'}</button>
            <button class="icon-btn tiny" data-cb-del="${escapeHtml(c.id)}" type="button" title="Remove">×</button>
          </div>
        </div>`).join('');

    // Focus XP + Reminders + Editable Tasks
    const fs = state.autoPilot?.focusStats || { xp: 0, level: 1, streakDays: 1 };
    document.getElementById('focus-xp-meta').textContent = `Level ${fs.level || 1} · ${fs.xp || 0} XP · ${fs.streakDays || 1}d streak`;

    const rems = state.autoPilot?.reminders || [];
    document.getElementById('reminders-count').textContent = `${rems.length} active`;
    document.getElementById('reminders-list').innerHTML = rems.length === 0
      ? `<span class="section-meta" style="padding:2px">No active reminders.</span>`
      : rems.map((r) => {
          const leftMin = Math.max(1, Math.ceil((r.dueAt - Date.now()) / 60000));
          return `<div class="task-item"><span class="task-text">${escapeHtml(r.text)}</span><div class="task-actions"><span class="elapsed-pill">${leftMin}m</span><button class="icon-btn tiny" data-del-rem="${escapeHtml(r.id)}" type="button">×</button></div></div>`;
        }).join('');

    const tasks = state.autoPilot?.tasks || [];
    document.getElementById('tasks-count').textContent = `${tasks.filter((t) => !t.done).length} open`;
    document.getElementById('tasks-list').innerHTML = tasks.length === 0
      ? `<div class="empty-state">No tasks yet — synced two-way with Mobile APK.</div>`
      : tasks.map((t) => state.editingTaskId === t.id
          ? `<div class="task-item"><input class="task-edit-input" data-edit-input="${escapeHtml(t.id)}" value="${escapeHtml(t.text)}" /><div class="task-actions"><button class="mini-btn primary" data-save-task="${escapeHtml(t.id)}" type="button">SAVE</button><button class="icon-btn tiny" data-cancel-edit="1" type="button">X</button></div></div>`
          : `<div class="task-item ${t.done ? 'done' : ''}"><div class="task-item-left" data-toggle-task="${escapeHtml(t.id)}"><span>${t.done ? '[X]' : '[ ]'}</span><span class="task-text">${escapeHtml(t.text)}</span></div><div class="task-actions"><button class="icon-btn tiny" data-edit-task="${escapeHtml(t.id)}" type="button">ED</button><button class="icon-btn tiny" data-del-task="${escapeHtml(t.id)}" type="button">X</button></div></div>`).join('');

    // Auto-pilot & Ports
    document.getElementById('toggle-ap-readonly').checked = Boolean(state.autoPilot?.rules?.autoAllowReadOnly);
    document.getElementById('toggle-ap-danger').checked = Boolean(state.autoPilot?.rules?.autoDenyDangerous);
    const ports = state.pulse?.ports || [];
    document.getElementById('ports-list').innerHTML = ports.length === 0
      ? `<span class="section-meta">No localhost dev servers listening.</span>`
      : ports.map((p) => `<button class="port-pill" data-open-port="${Number(p.port) || 0}" type="button">:${Number(p.port) || 0} ${escapeHtml(p.label)}</button>`).join('');

    // Alerts Tab
    const filtered = state.notifications.filter((n) => {
      if (state.notifFilter === 'all') return true;
      if (state.notifFilter === 'whatsapp') return n.category === 'whatsapp';
      if (state.notifFilter === 'agent') return n.category === 'agent';
      return n.category !== 'whatsapp' && n.category !== 'agent';
    });
    document.getElementById('notifications-list').innerHTML = filtered.length === 0
      ? `<div class="empty-state">No notifications — click any incoming message to open its exact app.</div>`
      : filtered.map((n) => `
          <div class="card notif-card clickable ${n.unread ? 'unread' : ''} ${escapeHtml(n.category)}" data-open-notif-card="${escapeHtml(n.id)}">
            <div class="card-top"><div class="card-title-wrap"><span class="agent-dot" style="background:${safeColor(n.accent, '#94a3b8')}"></span><span class="card-name">${escapeHtml(n.appName)} · ${escapeHtml(n.title)}</span></div><span class="section-meta">${formatRelativeTime(n.timestamp)}</span></div>
            ${n.body ? `<div class="card-task">${escapeHtml(n.body)}</div>` : ''}
            <div class="card-foot"><span>Open application</span><div class="card-actions">${n.unread ? `<button class="mini-btn" data-read-notif="${escapeHtml(n.id)}">✓</button>` : ''}<button class="mini-btn" data-dismiss-notif="${escapeHtml(n.id)}">×</button></div></div>
          </div>`).join('');

    // Studio Tab: Unresolved migration banner, Skin Swatches, Age Persona Synergy, Custom Heroes List
    const unresBanner = document.getElementById('unresolved-char-banner');
    if (unresBanner) {
      const unres = state.settings.unresolvedCharacter;
      unresBanner.classList.toggle('hidden', !unres);
      if (unres) {
        unresBanner.innerHTML = `<strong>Preserved previous character:</strong> "${escapeHtml(unres)}" could not be auto-mapped. Select any Hero below or recreate it in Hero Creator.`;
      }
    }

    const skinList = SKIN_CATALOG[ch] || [];
    const curSkin = state.settings.petSkins?.[ch] || skinList[0]?.id || '';
    document.getElementById('skin-swatches').innerHTML = skinList.length === 0
      ? `<span class="section-meta">Custom Hero active — customize colors in Hero Creator below.</span>`
      : skinList
        .map((sk) => `<button class="skin-swatch ${sk.id === curSkin ? 'active' : ''}" data-skin="${escapeHtml(sk.id)}" type="button"><span class="swatch-dot" style="background:${safeColor(sk.color, '#60a5fa')}"></span>${escapeHtml(sk.label)}</button>`)
        .join('');

    const curAge = state.settings.ageGroup === '0-15' ? '1-15' : (state.settings.ageGroup || '15-30');
    document.querySelectorAll('.seg-btn[data-age]').forEach((b) => b.classList.toggle('active', b.dataset.age === curAge));

    const synergyEl = document.getElementById('persona-synergy-banner');
    if (synergyEl) {
      const p = state.activePersona || {};
      const ageLabel = curAge === '1-15' ? '1–14 YOUNG EXPLORERS' : curAge === '30-60' ? '30–60 ARCHITECTS & MENTORS' : '15–29 ENGINEERS & BUILDERS';
      const paceSpec = curAge === '1-15'
        ? 'FAST STRIDE (1.25X) · CURIOUS WIDE OPTICS · STEP-BY-STEP MENTORING'
        : curAge === '30-60'
          ? 'STEADY STRIDE (0.78X) · CALM STEADY OPTICS · EXECUTIVE BRIEFINGS'
          : 'PRECISION STRIDE (1.0X) · FOCUSED SCAN OPTICS · DEEP CODING CO-PILOT';
      synergyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px">
          <div><strong>${escapeHtml(activeName.toUpperCase())} × ${escapeHtml(ageLabel)}</strong></div>
          <div style="font-size:10px;color:var(--sys-green)">PACE &amp; OPTICS // ${escapeHtml(paceSpec)}</div>
          <div>${escapeHtml(p.tagline || 'Adaptive robot telemetry & conversational persona active.')}</div>
          <div style="font-size:10.5px;color:var(--text-3)">${escapeHtml(p.guidance || '')}</div>
        </div>
      `;
    }

    // Custom Heroes Management List
    const customs = state.customHeroes || [];
    const cCount = document.getElementById('custom-heroes-count');
    if (cCount) cCount.textContent = `${customs.length} custom`;
    const cList = document.getElementById('custom-heroes-list');
    if (cList) {
      cList.innerHTML = customs.length === 0
        ? `<div class="empty-state">No custom companions yet — design a Hero, Animal, or Custom companion above.</div>`
        : customs.map((h) => `
          <div class="custom-hero-item ${h.id === rawChar ? 'active' : ''}">
            <div class="custom-hero-info">
              <span class="custom-hero-dot" style="background:${safeColor(h.primaryColor, '#6366f1')}"></span>
              <div style="min-width:0">
                <div class="custom-hero-name">${escapeHtml(h.nickname || h.name)}</div>
                <div class="custom-hero-meta">${escapeHtml(h.movement)} · ${escapeHtml(h.voiceProfile)} voice</div>
              </div>
            </div>
            <div class="custom-hero-actions">
              <button class="mini-btn ${h.id === rawChar ? 'primary' : ''}" data-ch-use="${escapeHtml(h.id)}" type="button">${h.id === rawChar ? 'Active' : 'Use'}</button>
              <button class="icon-btn tiny" data-ch-edit="${escapeHtml(h.id)}" type="button" title="Edit">✎</button>
              <button class="icon-btn tiny" data-ch-dup="${escapeHtml(h.id)}" type="button" title="Duplicate">⧉</button>
              <button class="icon-btn tiny" data-ch-exp="${escapeHtml(h.id)}" type="button" title="Export JSON">↗</button>
              <button class="icon-btn tiny" data-ch-del="${escapeHtml(h.id)}" type="button" title="Delete">×</button>
            </div>
          </div>`).join('');
    }
    document.getElementById('range-trans').value = String(state.settings.glassTransparency ?? 42);
    document.getElementById('range-size').value = String(state.settings.fishScale || 1.06);
    document.getElementById('size-label').textContent = `${Math.round((state.settings.fishScale || 1.06) * 100)}%`;

    document.getElementById('toggle-voice').checked = Boolean(state.settings.voiceEnabled);
    document.getElementById('toggle-bgm').checked = Boolean(state.settings.bgmEnabled);
    document.getElementById('toggle-autostart').checked = Boolean(state.settings.autoStart);
    document.getElementById('toggle-desktop-only').checked = state.settings.displayMode === 'desktop-only';
    document.getElementById('toggle-privacy-mask').checked = Boolean(state.settings.privacyMask);
    document.getElementById('toggle-wake-alerts').checked = Boolean(state.settings.wakeOnAlerts);
    document.body.classList.toggle('privacy-masked', Boolean(state.settings.privacyMask));

    document.querySelectorAll('.ctrl-btn[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.petMode));
    document.getElementById('hud-mode-label').textContent = state.petMode;

    // Mobile Remote Panel
    const mob = state.mobile || {};
    document.getElementById('mobile-status-meta').textContent = mob.tunnelUrl ? 'Live Worldwide (HTTPS)' : mob.running ? 'LAN Active' : 'Offline';
    document.getElementById('btn-mobile-stop').classList.toggle('hidden', !mob.running && !mob.tunnelRunning);
    const mobQrPanel = document.getElementById('mobile-qr-panel');
    mobQrPanel.classList.toggle('hidden', !mob.running);
    if (mob.running) {
      document.getElementById('mobile-qr-svg').innerHTML = mob.qrSvg || `<span style="color:#111;font-size:10px">Generating...</span>`;
      document.getElementById('mobile-pin-code').textContent = mob.pairingPin || 'Expired';
      document.getElementById('mobile-active-url').textContent = mob.tunnelUrl || mob.lanUrl || '';
    }

    // Claude Hooks
    const installed = Boolean(state.claudeHooks?.installed);
    document.getElementById('hook-banner').classList.toggle('connected', installed);
    document.getElementById('hook-banner-title').textContent = installed ? 'Claude Code Hooks Connected' : 'Claude Code Allow/Deny Bridge';
    document.getElementById('btn-quick-hook').textContent = installed ? 'Disconnect' : 'Connect';
    document.getElementById('btn-setup-hooks').textContent = installed ? 'Disconnect Claude Hooks' : 'Connect Claude Hooks';
    document.getElementById('hook-port-label').textContent = `127.0.0.1:${state.hookPort}`;

    renderTimersOnly();
  }

  // Tactile Retro-Tech Mechanical Key Click Synthesizer (Zero External Audio Files)
  let uiAudioCtx = null;
  function playHudKeySound(kind = 'tap') {
    if (state.settings?.bgmEnabled === false) return;
    try {
      if (!uiAudioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) uiAudioCtx = new AC();
      }
      if (!uiAudioCtx) return;
      if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume().catch(() => {});
      const t0 = uiAudioCtx.currentTime;
      const osc = uiAudioCtx.createOscillator();
      const gain = uiAudioCtx.createGain();
      osc.type = kind === 'action' ? 'sine' : 'triangle';
      const fStart = kind === 'toggle' ? 620 : kind === 'action' ? 540 : 860;
      const fEnd = kind === 'toggle' ? 960 : kind === 'action' ? 810 : 320;
      const dur = kind === 'action' ? 0.055 : 0.024;
      osc.frequency.setValueAtTime(fStart, t0);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.038, t0 + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(uiAudioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    } catch {}
  }

  hud.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button, summary, .switch, .skin-swatch, .mini-pulse-card, .window-row');
    if (!btn) return;
    if (btn.classList.contains('primary') || btn.classList.contains('send-btn') || btn.classList.contains('pet-card')) {
      playHudKeySound('action');
    } else if (btn.classList.contains('switch') || btn.classList.contains('seg-btn') || btn.classList.contains('tab-btn')) {
      playHudKeySound('toggle');
    } else {
      playHudKeySound('tap');
    }
  });

  // Top Controls & Morph
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeHud(); });
  document.getElementById('btn-close-hud').addEventListener('click', () => api.closeHud());
  document.getElementById('btn-deep-dive').addEventListener('click', () => api.setHudMode('deep', state.activeTab));
  document.getElementById('btn-compact').addEventListener('click', () => api.setHudMode('mini', state.activeTab));
  document.getElementById('mini-agent-card').addEventListener('click', () => api.setHudMode('deep', 'agents'));
  document.getElementById('mini-alert-card').addEventListener('click', async () => {
    const target = state.notifications.find((n) => n.unread) || state.notifications[0];
    if (target) { const r = await api.openNotificationApp(target); if (r?.state) applyFullState(r.state); }
  });
  document.getElementById('btn-pin').addEventListener('click', (e) => { state.pinned = !state.pinned; e.currentTarget.classList.toggle('active', state.pinned); api.setHudPinned(state.pinned); });
  document.getElementById('btn-refresh').addEventListener('click', async () => applyFullState(await api.refreshAll()));
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // Companion Library Filter + Character Switching (All 7 Built-in)
  document.querySelectorAll('[data-lib-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.libFilter = btn.dataset.libFilter || 'all';
      render();
    });
  });
  document.querySelectorAll('.char-chip, .pet-card').forEach((btn) => {
    btn.addEventListener('click', async () => applyFullState(await api.setPetCharacter(btn.dataset.char)));
  });

  // Rename Companion
  document.getElementById('rename-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = document.getElementById('rename-input').value.trim();
    if (!val) return;
    applyFullState(await api.saveSettings({ petNames: { [state.petCharacter]: val } }));
    showCommandFeedback(`Renamed to "${val}"`);
  });

  // Age Profile & Sliders & Toggles
  document.querySelectorAll('.seg-btn[data-age]').forEach((b) => b.addEventListener('click', async () => {
    const nextAge = b.dataset.age;
    applyFullState(await api.saveSettings({ ageGroup: nextAge }));
    const labelMap = {
      '1-15': 'AGE 1-14 EXPLORER MODE ACTIVE (FAST STRIDE + WIDE OPTICS)',
      '15-30': 'AGE 15-29 BUILDER MODE ACTIVE (PRECISION STRIDE + SCAN OPTICS)',
      '30-60': 'AGE 30-60 ARCHITECT MODE ACTIVE (STEADY STRIDE + CALM OPTICS)',
    };
    showCommandFeedback(labelMap[nextAge] || `AGE PROFILE -> ${nextAge}`);
  }));
  document.getElementById('range-trans').addEventListener('input', (e) => applyGlassTransparency(Number(e.target.value)));
  document.getElementById('range-trans').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ glassTransparency: Number(e.target.value) })));
  document.getElementById('range-size').addEventListener('input', (e) => { document.getElementById('size-label').textContent = `${Math.round(Number(e.target.value) * 100)}%`; });
  document.getElementById('range-size').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ fishScale: Number(e.target.value) })));

  document.getElementById('toggle-voice').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ voiceEnabled: e.target.checked })));
  document.getElementById('toggle-dance-mode')?.addEventListener('change', async (e) => {
    const nextDance = Boolean(e.target.checked);
    applyFullState(await api.toggleDanceMode(nextDance));
    showCommandFeedback(nextDance ? 'DANCE MODE: ON' : 'DANCE MODE: OFF');
  });
  async function handleVoiceProfileSelect(voiceId) {
    if (!voiceId) return;
    applyFullState(await api.saveSettings({ selectedVoice: voiceId }));
    showCommandFeedback(`VOICE LOCKED -> ${voiceId.toUpperCase()}`);
  }
  document.getElementById('voice-select')?.addEventListener('change', (e) => handleVoiceProfileSelect(e.target.value));
  document.getElementById('studio-voice-select')?.addEventListener('change', (e) => handleVoiceProfileSelect(e.target.value));
  document.getElementById('toggle-bgm').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ bgmEnabled: e.target.checked })));
  document.getElementById('toggle-autostart').addEventListener('change', async (e) => {
    applyFullState(await api.saveSettings({ autoStart: e.target.checked }));
    showCommandFeedback(e.target.checked ? 'AUTO-START WITH WINDOWS: ON' : 'MANUAL STARTUP MODE');
  });
  document.getElementById('toggle-desktop-only').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ displayMode: e.target.checked ? 'desktop-only' : 'floating' })));
  document.getElementById('toggle-privacy-mask').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ privacyMask: e.target.checked })));
  document.getElementById('toggle-wake-alerts').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ wakeOnAlerts: e.target.checked })));
  document.getElementById('btn-test-voice').addEventListener('click', () => {
    api.speakText(`Arre bhai, ${getCharName()} here! Main English, Hinglish aur Hindi teeno me baat kar sakta hoon, aur music sunte hue task bhi padhta hoon.`);
    showCommandFeedback(`NEURAL VOICE CHECK // ${getCharName().toUpperCase()}`);
  });

  // Live Agent Telemetry Announce Buttons
  async function triggerAgentAnnouncement(agentId = '') {
    if (!api.announceAgent) return;
    const res = await api.announceAgent(agentId);
    if (res?.message) showCommandFeedback(res.message);
  }
  document.getElementById('btn-announce-agent')?.addEventListener('click', () => triggerAgentAnnouncement(''));
  document.getElementById('btn-mini-announce')?.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerAgentAnnouncement('');
  });

  // Chat Controls & Focus Lens
  document.getElementById('model-select').addEventListener('change', async (e) => { if (e.target.value) applyFullState(await api.setLLMModel(e.target.value)); });
  document.getElementById('btn-think-mode').addEventListener('click', async () => {
    applyFullState(await api.setThinkMode(!state.settings.thinkMode));
    showCommandFeedback(state.settings.thinkMode ? 'DEEP THINKING MODE: ON' : 'FAST RESPONSE MODE: ON');
  });
  document.getElementById('btn-voice-toggle').addEventListener('click', async () => {
    applyFullState(await api.saveSettings({ voiceEnabled: !state.settings.voiceEnabled }));
    showCommandFeedback(state.settings.voiceEnabled ? 'NEURAL VOICE REPLIES: ON' : 'NEURAL VOICE REPLIES: OFF');
  });
  document.getElementById('btn-clear-ai').addEventListener('click', async () => { state.lastMiniAi = null; applyFullState(await api.clearLLMChat()); });

  async function runClipboardLens() {
    state.llm.isThinking = true;
    if (state.viewMode === 'deep') switchTab('ai');
    render();
    const res = await api.explainClipboard();
    state.lastMiniAi = { reply: res.reply, model: res.model, actionNote: 'Focus Lens' };
    if (res?.state) applyFullState(res.state); else render();
  }
  document.getElementById('btn-mini-lens').addEventListener('click', runClipboardLens);
  document.getElementById('btn-chat-lens').addEventListener('click', runClipboardLens);
  document.getElementById('btn-cb-explain').addEventListener('click', runClipboardLens);
  document.getElementById('btn-cb-clear').addEventListener('click', async () => applyFullState(await api.clipboardClear()));

  // Music Player & Theme BGM Controls
  document.getElementById('btn-bgm-loop').addEventListener('click', async () => {
    applyFullState(await api.toggleBgmLoop(!state.music?.bgmLoopActive));
    showCommandFeedback(state.music?.bgmLoopActive ? `${getCharName().toUpperCase()} THEME AUDIO: ON` : 'THEME AUDIO: OFF');
  });
  document.getElementById('btn-theme-playlist').addEventListener('click', async () => {
    const res = await api.launchApp(`bgm-${state.petCharacter}`, {});
    showCommandFeedback(res?.ok ? `Opened ${res.label} in Brave` : 'Could not open playlist');
  });
  async function handleDanceToggle() {
    const nextDance = !state.settings.danceModeEnabled;
    if (api.toggleDanceMode) {
      applyFullState(await api.toggleDanceMode(nextDance));
    } else {
      api.dancePet();
    }
    showCommandFeedback(nextDance ? 'DANCE MODE: ON (STUDIO HEADPHONES ACTIVE)' : 'DANCE MODE: OFF');
  }
  document.getElementById('btn-mini-dance')?.addEventListener('click', handleDanceToggle);
  document.getElementById('btn-ctrl-dance').addEventListener('click', handleDanceToggle);
  document.getElementById('btn-pet-dance').addEventListener('click', handleDanceToggle);

  // Connectivity Controls
  async function handleWifiToggle(en) { showCommandFeedback(en ? 'Wi-Fi ON...' : 'Wi-Fi OFF...'); const r = await api.toggleWifi(en); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || 'Wi-Fi updated'); }
  async function handleBtToggle(en) { showCommandFeedback(en ? 'Bluetooth ON...' : 'Bluetooth OFF...'); const r = await api.toggleBluetooth(en); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || 'Bluetooth updated'); }
  async function handleFlightToggle(en) { showCommandFeedback(en ? 'Flight Mode ON...' : 'Flight Mode OFF...'); const r = await api.toggleFlightMode(en); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || 'Flight updated'); }

  document.getElementById('mini-btn-wifi').addEventListener('click', () => handleWifiToggle(!state.sys?.wifiOn));
  document.getElementById('mini-btn-bt').addEventListener('click', () => handleBtToggle(!state.sys?.bluetoothOn));
  document.getElementById('mini-btn-flight').addEventListener('click', () => handleFlightToggle(!state.sys?.flightMode));
  document.getElementById('cc-tile-wifi').addEventListener('click', () => handleWifiToggle(!state.sys?.wifiOn));
  document.getElementById('cc-tile-bt').addEventListener('click', () => handleBtToggle(!state.sys?.bluetoothOn));
  document.getElementById('cc-tile-flight').addEventListener('click', () => handleFlightToggle(!state.sys?.flightMode));
  document.getElementById('btn-drawer-wifi').addEventListener('click', async () => { state.activeDrawer = state.activeDrawer === 'wifi' ? null : 'wifi'; renderSystemControls(); if (state.activeDrawer === 'wifi') applyFullState(await api.refreshSystemControls()); });
  document.getElementById('btn-drawer-bt').addEventListener('click', async () => { state.activeDrawer = state.activeDrawer === 'bt' ? null : 'bt'; renderSystemControls(); if (state.activeDrawer === 'bt') applyFullState(await api.refreshSystemControls()); });
  document.getElementById('btn-sys-refresh').addEventListener('click', async () => applyFullState(await api.refreshSystemControls()));
  document.getElementById('btn-wifi-panel').addEventListener('click', () => api.openSystemSettings('ms-availablenetworks:'));
  document.getElementById('btn-bt-panel').addEventListener('click', () => api.openSystemSettings('ms-settings:bluetooth'));
  document.getElementById('btn-sys-mute').addEventListener('click', async () => { const r = await api.toggleMute(); showCommandFeedback(r?.message || 'Toggled mute'); });
  document.getElementById('btn-sys-lock').addEventListener('click', () => api.lockPC());

  // Reminders & Tasks Forms
  document.getElementById('rem-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const txt = document.getElementById('rem-input').value.trim();
    const mins = Number(document.getElementById('rem-mins').value) || 10;
    if (!txt) return;
    document.getElementById('rem-input').value = '';
    applyFullState(await api.addReminder(txt, mins));
    showCommandFeedback(`Reminder set (${mins}m): "${txt}"`);
  });
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('task-input');
    const txt = inp.value.trim();
    if (!txt) return;
    inp.value = '';
    applyFullState(await api.addTask(txt));
  });
  async function submitOmniLaunch(asApp) {
    const inp = document.getElementById('omni-launch-input');
    const val = inp.value.trim();
    if (!val) return;
    const res = await api.launchApp(val, { asApp });
    if (res?.ok) inp.value = '';
    showCommandFeedback(res?.ok ? `Opened ${res.label}` : res?.error || 'Could not open');
  }
  document.getElementById('omni-launch-form').addEventListener('submit', (e) => { e.preventDefault(); submitOmniLaunch(false); });
  document.getElementById('btn-omni-webapp').addEventListener('click', () => submitOmniLaunch(true));

  // Mobile Remote Controls
  document.getElementById('btn-mobile-world').addEventListener('click', async () => { showCommandFeedback('Starting Cloudflare Worldwide Tunnel...'); applyFullState(await api.mobileStartTunnel()); showCommandFeedback(state.mobile?.tunnelUrl ? 'Worldwide HTTPS Tunnel LIVE!' : state.mobile?.tunnelStatus || 'Check internet'); });
  document.getElementById('btn-mobile-lan').addEventListener('click', async () => { applyFullState(await api.mobileStartLan()); showCommandFeedback(`LAN active: ${state.mobile?.lanUrl}`); });
  document.getElementById('btn-mobile-stop').addEventListener('click', async () => { applyFullState(await api.mobileStop()); showCommandFeedback('Mobile Remote stopped.'); });
  document.getElementById('btn-mobile-copy').addEventListener('click', async () => { const r = await api.mobileCopyLink(); showCommandFeedback(r?.ok ? 'Pairing Link copied!' : 'Start tunnel first.'); });
  document.getElementById('btn-mobile-pin').addEventListener('click', async () => { applyFullState(await api.mobileNewPin()); showCommandFeedback(`PIN: ${state.mobile?.pairingPin}`); });
  document.getElementById('btn-mobile-rotate').addEventListener('click', async () => { applyFullState(await api.mobileRotateToken()); showCommandFeedback('256-bit key rotated.'); });
  document.getElementById('btn-mobile-apk').addEventListener('click', async () => { await api.mobileOpenApkFolder(); });

  // Delegated Click Events
  hud.addEventListener('click', async (e) => {
    const skinBtn = e.target.closest('button[data-skin]');
    if (skinBtn) {
      applyFullState(await api.saveSettings({ petSkins: { [state.petCharacter]: skinBtn.dataset.skin } }));
      showCommandFeedback(`Skin → ${skinBtn.textContent}`);
      return;
    }
    const mediaBtn = e.target.closest('button[data-media]');
    if (mediaBtn) { const r = await api.mediaControl(mediaBtn.dataset.media); if (r?.state) applyFullState(r.state); return; }
    const announceBtn = e.target.closest('button[data-announce-agent]');
    if (announceBtn) { await triggerAgentAnnouncement(announceBtn.dataset.announceAgent); return; }
    const copyRawBtn = e.target.closest('button[data-copy-raw]');
    if (copyRawBtn) {
      if (api.copyText) await api.copyText(copyRawBtn.dataset.copyRaw);
      showCommandFeedback('COPIED TO CLIPBOARD');
      return;
    }
    const speakRawBtn = e.target.closest('button[data-speak-raw]');
    if (speakRawBtn) {
      if (speakRawBtn.dataset.speakRaw) api.speakText(speakRawBtn.dataset.speakRaw);
      return;
    }
    const copyIdxBtn = e.target.closest('button[data-copy-idx]');
    if (copyIdxBtn) {
      const msg = state.llm?.history?.[Number(copyIdxBtn.dataset.copyIdx)];
      if (msg?.content && api.copyText) {
        await api.copyText(msg.content);
        showCommandFeedback('MESSAGE COPIED TO CLIPBOARD');
      }
      return;
    }
    const speakBtn = e.target.closest('button[data-speak-idx]');
    if (speakBtn) { const msg = state.llm?.history?.[Number(speakBtn.dataset.speakIdx)]; if (msg?.content) api.speakText(msg.content); return; }
    const delChatBtn = e.target.closest('button[data-del-chat-idx]');
    if (delChatBtn) {
      const idx = Number(delChatBtn.dataset.delChatIdx);
      if (api.deleteChatMsg) {
        applyFullState(await api.deleteChatMsg(idx));
        showCommandFeedback('CHAT MESSAGE DELETED');
      }
      return;
    }
    const cbCopy = e.target.closest('[data-cb-copy]');
    if (cbCopy) { await api.clipboardCopy(cbCopy.dataset.cbCopy); showCommandFeedback('Copied back to clipboard!'); return; }
    const cbPin = e.target.closest('button[data-cb-pin]');
    if (cbPin) { applyFullState(await api.clipboardPin(cbPin.dataset.cbPin)); return; }
    const cbDel = e.target.closest('button[data-cb-del]');
    if (cbDel) { applyFullState(await api.clipboardDelete(cbDel.dataset.cbDel)); return; }
    const delRem = e.target.closest('button[data-del-rem]');
    if (delRem) { applyFullState(await api.deleteReminder(delRem.dataset.delRem)); return; }

    const idleToggle = e.target.closest('[data-toggle-idle]');
    if (idleToggle) { const id = idleToggle.dataset.toggleIdle; if (state.expandedIdleAgents.has(id)) state.expandedIdleAgents.delete(id); else state.expandedIdleAgents.add(id); render(); return; }
    const editTaskBtn = e.target.closest('button[data-edit-task]');
    if (editTaskBtn) { state.editingTaskId = editTaskBtn.dataset.editTask; render(); const inp = hud.querySelector(`input[data-edit-input="${CSS.escape(state.editingTaskId)}"]`); if (inp) { inp.focus(); inp.select(); } return; }
    const saveTaskBtn = e.target.closest('button[data-save-task]');
    if (saveTaskBtn) { const id = saveTaskBtn.dataset.saveTask; const v = hud.querySelector(`input[data-edit-input="${CSS.escape(id)}"]`)?.value.trim() || ''; state.editingTaskId = null; if (v) applyFullState(await api.editTask(id, v)); else render(); return; }
    if (e.target.closest('button[data-cancel-edit]')) { state.editingTaskId = null; render(); return; }
    const quickPrompt = e.target.closest('[data-quick-prompt]');
    if (quickPrompt) { await executeInput(quickPrompt.dataset.quickPrompt); return; }

    const wifiConn = e.target.closest('button[data-wifi-connect]');
    if (wifiConn) { const r = await api.connectWifi(wifiConn.dataset.wifiConnect); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || 'Connecting...'); return; }
    if (e.target.closest('button[data-wifi-disconnect]')) { const r = await api.disconnectWifi(); if (r?.fullState) applyFullState(r.fullState); return; }
    const btConn = e.target.closest('button[data-bt-mac]');
    if (btConn) { const r = await api.connectBluetooth(btConn.dataset.btMac, btConn.dataset.btConnect === '1'); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || 'BT updated'); return; }

    const allowDeny = e.target.closest('button[data-act]');
    if (allowDeny) { e.stopPropagation(); const r = await api.resolveApproval(allowDeny.dataset.id, allowDeny.dataset.act); if (r?.state) applyFullState(r.state); return; }
    const readNotif = e.target.closest('button[data-read-notif]');
    if (readNotif) { e.stopPropagation(); applyFullState(await api.markNotificationRead(readNotif.dataset.readNotif)); return; }
    const dismissNotif = e.target.closest('button[data-dismiss-notif]');
    if (dismissNotif) { e.stopPropagation(); applyFullState(await api.dismissNotification(dismissNotif.dataset.dismissNotif)); return; }
    const notifCard = e.target.closest('[data-open-notif-card]');
    if (notifCard) { const t = state.notifications.find((n) => n.id === notifCard.dataset.openNotifCard); if (t) { const r = await api.openNotificationApp(t); if (r?.state) applyFullState(r.state); } return; }

    const focusEl = e.target.closest('[data-focus]');
    if (focusEl) { await api.focusApp(focusEl.dataset.focus); return; }
    const dockBtn = e.target.closest('button[data-app]');
    if (dockBtn) { const r = await api.launchApp(dockBtn.dataset.app, {}); showCommandFeedback(r?.ok ? `Opened ${r.label}` : r?.error || 'Not found'); return; }
    const portBtn = e.target.closest('button[data-open-port]');
    if (portBtn) { await api.openPort(Number(portBtn.dataset.openPort)); return; }
    const sprintBtn = e.target.closest('button[data-sprint]');
    if (sprintBtn) { applyFullState(await api.startTimer(Number(sprintBtn.dataset.sprint), 'Study Sprint')); return; }
    const toggleTask = e.target.closest('[data-toggle-task]');
    if (toggleTask) { applyFullState(await api.toggleTask(toggleTask.dataset.toggleTask)); return; }
    const delTask = e.target.closest('button[data-del-task]');
    if (delTask) { applyFullState(await api.deleteTask(delTask.dataset.delTask)); return; }
  });

  document.getElementById('btn-sprint-stop').addEventListener('click', async () => applyFullState(await api.stopTimer()));
  document.getElementById('toggle-ap-readonly').addEventListener('change', async (e) => applyFullState(await api.updateAutoPilotRules({ autoAllowReadOnly: e.target.checked })));
  document.getElementById('toggle-ap-danger').addEventListener('change', async (e) => applyFullState(await api.updateAutoPilotRules({ autoDenyDangerous: e.target.checked })));
  document.querySelectorAll('.filter-pill').forEach((p) => p.addEventListener('click', () => { state.notifFilter = p.dataset.filter; document.querySelectorAll('.filter-pill').forEach((x) => x.classList.toggle('active', x === p)); render(); }));
  document.getElementById('btn-read-all').addEventListener('click', async () => applyFullState(await api.markNotificationRead('all')));
  document.getElementById('btn-clear-all').addEventListener('click', async () => applyFullState(await api.dismissNotification('all')));
  document.querySelectorAll('.ctrl-btn[data-mode]').forEach((b) => b.addEventListener('click', async () => applyFullState(await api.setPetMode(b.dataset.mode))));
  document.getElementById('btn-pick-spot').addEventListener('click', () => api.startSpotPicker());
  document.querySelectorAll('.corner-btn[data-corner]').forEach((b) => b.addEventListener('click', async () => applyFullState(await api.goToCorner(b.dataset.corner, true))));

  async function toggleClaudeHooks() {
    const fb = document.getElementById('setup-feedback');
    if (state.claudeHooks?.installed) { const r = await api.uninstallClaudeHooks(); state.claudeHooks.installed = false; fb.textContent = r.ok ? 'Disconnected.' : r.error; }
    else { const r = await api.installClaudeHooks(); state.claudeHooks.installed = Boolean(r.installed); fb.textContent = r.ok ? 'Connected!' : r.error; }
    render();
  }
  document.getElementById('btn-quick-hook').addEventListener('click', toggleClaudeHooks);
  document.getElementById('btn-setup-hooks').addEventListener('click', toggleClaudeHooks);
  document.getElementById('btn-test-approval').addEventListener('click', async () => { await api.triggerDemoApproval(); switchTab('agents'); });
  document.getElementById('btn-test-wa').addEventListener('click', async () => { await api.triggerDemoWhatsApp(); switchTab('alerts'); });

  async function executeInput(raw) {
    const cmd = window.parsePetCommand(raw);
    if (!cmd) return;

    if (cmd.action === 'ask-llm') {
      state.llm.isThinking = true;
      if (state.viewMode === 'deep') switchTab('ai');
      render();
      const res = await api.askLLM(cmd.prompt, { thinkMode: state.settings.thinkMode });
      state.lastMiniAi = { reply: res.reply, model: res.model, actionNote: res.actionNote };
      if (res?.state) applyFullState(res.state); else render();
      return;
    }
    if (cmd.action === 'character') applyFullState(await api.setPetCharacter(cmd.character));
    else if (cmd.action === 'add-reminder') { applyFullState(await api.addReminder(cmd.text, cmd.minutes)); if (state.viewMode === 'deep') switchTab('tools'); }
    else if (cmd.action === 'media') { await api.mediaControl(cmd.command); }
    else if (cmd.action === 'explain-clipboard') { await runClipboardLens(); return; }
    else if (cmd.action === 'sys-wifi') { await handleWifiToggle(cmd.enable); return; }
    else if (cmd.action === 'sys-wifi-connect') { const r = await api.connectWifi(cmd.ssid); if (r?.fullState) applyFullState(r.fullState); showCommandFeedback(r?.message || cmd.reply); return; }
    else if (cmd.action === 'sys-wifi-disconnect') { const r = await api.disconnectWifi(); if (r?.fullState) applyFullState(r.fullState); return; }
    else if (cmd.action === 'sys-bt') { await handleBtToggle(cmd.enable); return; }
    else if (cmd.action === 'sys-bt-connect') { const r = await api.connectBluetooth(cmd.target, true); if (r?.fullState) applyFullState(r.fullState); return; }
    else if (cmd.action === 'sys-flight') { await handleFlightToggle(cmd.enable === 'toggle' ? !state.sys?.flightMode : Boolean(cmd.enable)); return; }
    else if (cmd.action === 'sys-mute') { await api.toggleMute(); }
    else if (cmd.action === 'sys-lock') { await api.lockPC(); return; }
    else if (cmd.action === 'open-app') { const r = await api.launchApp(cmd.appKey, { asApp: Boolean(cmd.asApp) }); showCommandFeedback(r?.ok ? `Opened ${r.label}` : r?.error || 'Not found'); return; }
    else if (cmd.action === 'search-brave') await api.searchInBrave(cmd.engine, cmd.query);
    else if (cmd.action === 'search-multi') await api.searchMulti(cmd.queries);
    else if (cmd.action === 'pet-dance') api.dancePet();
    else if (cmd.action === 'open-port') await api.openPort(cmd.port);
    else if (cmd.action === 'add-task') { applyFullState(await api.addTask(cmd.text)); if (state.viewMode === 'deep') switchTab('tools'); }
    else if (cmd.action === 'start-timer') { applyFullState(await api.startTimer(cmd.minutes, cmd.label)); if (state.viewMode === 'deep') switchTab('tools'); }
    else if (cmd.action === 'mode') applyFullState(await api.setPetMode(cmd.mode));
    else if (cmd.action === 'corner') applyFullState(await api.goToCorner(cmd.corner, cmd.thenStay));
    else if (cmd.action === 'pick-spot') { api.startSpotPicker(); return; }
    else if (cmd.action === 'display-mode') applyFullState(await api.saveSettings({ displayMode: cmd.displayMode }));
    else if (cmd.action === 'privacy') applyFullState(await api.saveSettings({ privacyMask: Boolean(cmd.enabled) }));
    else if (cmd.action === 'pet') api.petNemo();

    showCommandFeedback(cmd.reply);
  }

  document.getElementById('cmd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('cmd-input');
    const txt = inp.value.trim();
    if (!txt) return;
    inp.value = '';
    await executeInput(txt);
  });

  // Mic Button & Whisper Talk Button: Uses Local Open-Source Whisper (faster-whisper-base)
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = document.getElementById('btn-voice');
  const whisperBtn = document.getElementById('btn-whisper-talk');
  async function startWhisperDictation() {
    const inp = document.getElementById('cmd-input');
    inp.focus();
    if (voiceBtn.classList.contains('listening')) return;
    voiceBtn.classList.add('listening');
    if (whisperBtn) whisperBtn.textContent = 'LISTENING...';
    showCommandFeedback('JARVIS VOICE (A+S+D) LISTENING — SPEAK ANY COMMAND...');

    if (api.listenVoice) {
      try {
        const res = await api.listenVoice();
        voiceBtn.classList.remove('listening');
        if (whisperBtn) whisperBtn.textContent = 'JARVIS MIC';
        if (res?.ok && res.transcript) {
          inp.value = res.transcript;
          showCommandFeedback(`JARVIS HEARD: "${res.transcript}"`);
          await executeInput(res.transcript);
          inp.value = '';
          return;
        }
        showCommandFeedback(res?.error || 'NO SPEECH DETECTED — PRESS A+S+D OR JARVIS MIC AND SPEAK');
        return;
      } catch {}
    }

    if (whisperBtn) whisperBtn.textContent = 'JARVIS MIC';
    if (!SpeechRec) {
      voiceBtn.classList.remove('listening');
      showCommandFeedback('PRESS A+S+D TO SPEAK WITH JARVIS');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-IN';
    rec.onresult = (ev) => { const t = ev.results?.[0]?.[0]?.transcript || ''; if (t) executeInput(t); };
    rec.onerror = () => showCommandFeedback('PRESS A+S+D OR TYPE YOUR COMMAND');
    rec.onend = () => voiceBtn.classList.remove('listening');
    try { rec.start(); } catch { voiceBtn.classList.remove('listening'); }
  }
  voiceBtn.addEventListener('click', startWhisperDictation);
  whisperBtn?.addEventListener('click', startWhisperDictation);

  api.onFullState((data) => applyFullState(data));
  api.onHudView((v) => { if (v) applyViewMode(v.mode, v.tab); });
  if (api.onFocusChat) {
    api.onFocusChat(() => {
      switchTab('ai');
      const inp = document.getElementById('cmd-input');
      if (inp) inp.focus();
      showCommandFeedback(`${getCharName()} woke via A+S+D — saved chat ready!`);
    });
  }

  // =========================================================================
  // HERO CREATOR — LIVE CANVAS PREVIEW, ARTWORK UPLOAD, CRUD & IMPORT/EXPORT
  // =========================================================================
  let hcArtworkDataUrl = '';
  let hcPreviewImg = null;
  const hcCanvas = document.getElementById('hero-creator-preview');
  const hcCtx = hcCanvas ? hcCanvas.getContext('2d') : null;

  function drawHeroCreatorPreview() {
    if (!hcCtx || !hcCanvas) return;
    const p = document.getElementById('hc-primary')?.value || '#6366f1';
    const sec = document.getElementById('hc-secondary')?.value || '#0ea5e9';
    const acc = document.getElementById('hc-accent')?.value || '#f8fafc';
    const tpl = document.getElementById('hc-template')?.value || 'acrobat';
    const mov = document.getElementById('hc-movement')?.value || 'swing';
    const nm = document.getElementById('hc-name')?.value.trim() || 'New Companion';
    const pName = document.getElementById('hc-preview-name');
    const pSub = document.getElementById('hc-preview-sub');
    if (pName) pName.textContent = nm;
    if (pSub) pSub.textContent = `${hcArtworkDataUrl ? 'Custom Artwork' : `${tpl} template`} · ${mov} physics`;

    const c = hcCtx;
    c.clearRect(0, 0, 96, 96);
    const cx = 48;
    const cy = 50;

    if (hcArtworkDataUrl && hcPreviewImg && hcPreviewImg.complete && hcPreviewImg.naturalWidth > 0) {
      c.save();
      c.strokeStyle = p;
      c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, 34, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, 32, 0, Math.PI * 2); c.clip();
      c.drawImage(hcPreviewImg, cx - 32, cy - 32, 64, 64);
      c.restore();
      return;
    }

    if (tpl === 'kronos') {
      for (const x of [24, 38, 52, 66]) {
        c.fillStyle = p;
        c.beginPath(); c.roundRect(x, 22, 10, 52, 2); c.fill();
      }
      c.fillStyle = '#090d16';
      c.fillRect(39, 28, 22, 14);
      c.fillStyle = sec;
      c.fillRect(42, 32, 7, 6); c.fillRect(52, 34, 6, 4);
    } else if (tpl === 'optix') {
      c.fillStyle = '#18181b';
      c.beginPath(); c.roundRect(24, 58, 48, 14, 4); c.fill();
      c.fillStyle = p;
      c.beginPath(); c.roundRect(28, 36, 40, 24, 4); c.fill();
      c.fillStyle = acc;
      c.beginPath(); c.roundRect(30, 18, 16, 14, 5); c.roundRect(50, 18, 16, 14, 5); c.fill();
      c.fillStyle = sec;
      c.beginPath(); c.arc(38, 25, 4, 0, Math.PI * 2); c.arc(58, 25, 4, 0, Math.PI * 2); c.fill();
    } else if (tpl === 'orbit') {
      c.fillStyle = p;
      c.beginPath(); c.roundRect(28, 20, 40, 50, 18); c.fill();
      c.fillStyle = '#090d16';
      c.beginPath(); c.roundRect(33, 27, 30, 16, 8); c.fill();
      c.fillStyle = sec;
      c.beginPath(); c.arc(42, 35, 3.5, 0, Math.PI * 2); c.arc(54, 35, 3.5, 0, Math.PI * 2); c.fill();
    } else if (tpl === 'aquatic') {
      c.fillStyle = sec;
      c.beginPath(); c.moveTo(26, cy); c.lineTo(14, cy - 12); c.lineTo(14, cy + 12); c.closePath(); c.fill();
      c.fillStyle = p;
      c.beginPath(); c.ellipse(52, cy, 24, 16, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = acc;
      c.fillRect(46, cy - 15, 5, 30);
      c.fillStyle = '#0f172a';
      c.beginPath(); c.arc(65, cy - 4, 3, 0, Math.PI * 2); c.fill();
    } else if (tpl === 'holo') {
      c.strokeStyle = sec; c.lineWidth = 2;
      c.beginPath(); c.ellipse(cx, cy, 34, 13, 0.35, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = p;
      c.beginPath(); c.ellipse(cx, cy, 34, 13, -0.35, 0, Math.PI * 2); c.stroke();
      c.fillStyle = p;
      c.beginPath(); c.arc(cx, cy, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = acc;
      c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    } else if (tpl === 'guardian') {
      c.fillStyle = '#09090b';
      c.beginPath(); c.moveTo(cx - 12, cy); c.lineTo(14, cy + 28); c.lineTo(82, cy + 28); c.lineTo(cx + 12, cy); c.closePath(); c.fill();
      c.fillStyle = p;
      c.beginPath(); c.moveTo(35, 28); c.lineTo(32, 12); c.lineTo(42, 24); c.lineTo(54, 24); c.lineTo(64, 12); c.lineTo(61, 28); c.closePath(); c.fill();
      c.beginPath(); c.arc(cx, 38, 17, 0, Math.PI * 2); c.fill();
      c.fillStyle = acc;
      c.fillRect(38, 35, 7, 3); c.fillRect(51, 35, 7, 3);
      c.fillStyle = sec;
      c.fillRect(34, 60, 28, 5);
    } else if (tpl === 'mech') {
      c.fillStyle = p;
      c.beginPath(); c.roundRect(30, 18, 36, 36, 12); c.fill();
      c.fillStyle = sec;
      c.beginPath(); c.roundRect(35, 24, 26, 24, 8); c.fill();
      c.fillStyle = acc;
      c.fillRect(38, 33, 8, 3.5); c.fillRect(50, 33, 8, 3.5);
      c.fillStyle = p;
      c.beginPath(); c.roundRect(33, 55, 30, 20, 8); c.fill();
      c.fillStyle = acc;
      c.beginPath(); c.arc(cx, 65, 5.5, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = p;
      c.beginPath(); c.arc(cx, 36, 19, 0, Math.PI * 2); c.fill();
      c.fillStyle = acc;
      c.beginPath(); c.ellipse(41, 36, 6, 4, -0.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(55, 36, 6, 4, 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = p;
      c.beginPath(); c.roundRect(34, 55, 28, 22, 9); c.fill();
      c.fillStyle = sec;
      c.fillRect(34, 60, 6, 12); c.fillRect(56, 60, 6, 12);
    }
  }

  function resetHeroCreatorForm() {
    document.getElementById('hc-edit-id').value = '';
    document.getElementById('hc-name').value = '';
    document.getElementById('hc-nickname').value = '';
    document.getElementById('hc-personality').value = '';
    hcArtworkDataUrl = '';
    hcPreviewImg = null;
    document.getElementById('hc-art-clear')?.classList.add('hidden');
    document.getElementById('hc-cancel-edit')?.classList.add('hidden');
    document.getElementById('hc-submit-btn').textContent = 'Create & Activate';
    drawHeroCreatorPreview();
  }

  ['hc-name', 'hc-template', 'hc-movement', 'hc-primary', 'hc-secondary', 'hc-accent'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', drawHeroCreatorPreview);
    document.getElementById(id)?.addEventListener('change', drawHeroCreatorPreview);
  });

  document.getElementById('hc-art-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fb = document.getElementById('hc-feedback');
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      if (fb) fb.textContent = 'Only PNG, JPEG, or WebP images are supported.';
      return;
    }
    if (file.size > 380 * 1024) {
      if (fb) fb.textContent = 'Image must be 380 KB or smaller.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      hcArtworkDataUrl = String(reader.result || '');
      hcPreviewImg = new Image();
      hcPreviewImg.onload = drawHeroCreatorPreview;
      hcPreviewImg.src = hcArtworkDataUrl;
      document.getElementById('hc-art-clear')?.classList.remove('hidden');
      if (fb) fb.textContent = 'Local artwork loaded (stored privately on your PC only).';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('hc-art-clear')?.addEventListener('click', () => {
    hcArtworkDataUrl = '';
    hcPreviewImg = null;
    document.getElementById('hc-art-file').value = '';
    document.getElementById('hc-art-clear').classList.add('hidden');
    drawHeroCreatorPreview();
  });

  document.getElementById('hc-cancel-edit')?.addEventListener('click', resetHeroCreatorForm);

  document.getElementById('hc-import-toggle')?.addEventListener('click', () => {
    document.getElementById('hc-import-box')?.classList.toggle('hidden');
  });
  document.getElementById('hc-import-cancel')?.addEventListener('click', () => {
    document.getElementById('hc-import-box')?.classList.add('hidden');
  });
  document.getElementById('hc-import-apply')?.addEventListener('click', async () => {
    const raw = document.getElementById('hc-import-json')?.value.trim();
    const fb = document.getElementById('hc-feedback');
    if (!raw) return;
    const res = await api.customHeroImport(raw);
    if (res?.state) applyFullState(res.state);
    if (res?.ok) {
      document.getElementById('hc-import-json').value = '';
      document.getElementById('hc-import-box').classList.add('hidden');
      if (fb) fb.textContent = `Imported "${res.hero.name}"!`;
    } else if (fb) {
      fb.textContent = res?.error || 'Import failed.';
    }
  });

  document.getElementById('hero-creator-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('hc-edit-id').value.trim();
    const payload = {
      category: document.getElementById('hc-category')?.value || 'hero',
      name: document.getElementById('hc-name').value.trim(),
      nickname: document.getElementById('hc-nickname').value.trim(),
      template: document.getElementById('hc-template').value,
      movement: document.getElementById('hc-movement').value,
      primaryColor: document.getElementById('hc-primary').value,
      secondaryColor: document.getElementById('hc-secondary').value,
      accentColor: document.getElementById('hc-accent').value,
      voiceProfile: document.getElementById('hc-voice').value,
      reactionStyle: document.getElementById('hc-reaction').value,
      soundPack: document.getElementById('hc-sound').value,
      size: Number(document.getElementById('hc-size').value || 1.05),
      speed: Number(document.getElementById('hc-speed').value || 1.0),
      personality: document.getElementById('hc-personality').value.trim(),
      artworkDataUrl: hcArtworkDataUrl,
    };
    const fb = document.getElementById('hc-feedback');
    const res = editId
      ? await api.customHeroUpdate(editId, payload)
      : await api.customHeroCreate(payload);
    if (res?.state) applyFullState(res.state);
    if (res?.ok) {
      if (fb) fb.textContent = editId ? `Updated "${res.hero.name}"!` : `Created & activated "${res.hero.name}"!`;
      resetHeroCreatorForm();
    } else if (fb) {
      fb.textContent = res?.error || 'Could not save custom hero.';
    }
  });

  document.getElementById('custom-heroes-list')?.addEventListener('click', async (e) => {
    const fb = document.getElementById('hc-feedback');
    const useBtn = e.target.closest('[data-ch-use]');
    if (useBtn) {
      applyFullState(await api.setPetCharacter(useBtn.dataset.chUse));
      return;
    }
    const editBtn = e.target.closest('[data-ch-edit]');
    if (editBtn) {
      const h = (state.customHeroes || []).find((x) => x.id === editBtn.dataset.chEdit);
      if (!h) return;
      document.getElementById('hc-edit-id').value = h.id;
      if (document.getElementById('hc-category')) document.getElementById('hc-category').value = h.category || 'hero';
      document.getElementById('hc-name').value = h.name || '';
      document.getElementById('hc-nickname').value = h.nickname || '';
      document.getElementById('hc-template').value = h.template === 'custom-art' ? 'acrobat' : (h.template || 'acrobat');
      document.getElementById('hc-movement').value = h.movement || 'swing';
      document.getElementById('hc-primary').value = safeColor(h.primaryColor, '#6366f1');
      document.getElementById('hc-secondary').value = safeColor(h.secondaryColor, '#0ea5e9');
      document.getElementById('hc-accent').value = safeColor(h.accentColor, '#f8fafc');
      document.getElementById('hc-voice').value = h.voiceProfile || 'energetic';
      document.getElementById('hc-reaction').value = h.reactionStyle || 'sparks';
      document.getElementById('hc-sound').value = h.soundPack || 'ambient';
      document.getElementById('hc-size').value = String(h.size || 1.05);
      document.getElementById('hc-speed').value = String(h.speed || 1.0);
      document.getElementById('hc-personality').value = h.personality || '';
      hcArtworkDataUrl = h.artworkDataUrl || '';
      if (hcArtworkDataUrl) {
        hcPreviewImg = new Image();
        hcPreviewImg.onload = drawHeroCreatorPreview;
        hcPreviewImg.src = hcArtworkDataUrl;
        document.getElementById('hc-art-clear')?.classList.remove('hidden');
      }
      document.getElementById('hc-cancel-edit')?.classList.remove('hidden');
      document.getElementById('hc-submit-btn').textContent = 'Save Hero Changes';
      drawHeroCreatorPreview();
      return;
    }
    const dupBtn = e.target.closest('[data-ch-dup]');
    if (dupBtn) {
      const res = await api.customHeroDuplicate(dupBtn.dataset.chDup);
      if (res?.state) applyFullState(res.state);
      if (fb) fb.textContent = res?.ok ? `Duplicated as "${res.hero.name}"` : (res?.error || 'Duplicate failed');
      return;
    }
    const expBtn = e.target.closest('[data-ch-exp]');
    if (expBtn) {
      const res = await api.customHeroExport(expBtn.dataset.chExp);
      if (res?.ok && res.json) {
        try { await navigator.clipboard.writeText(res.json); } catch {}
        if (fb) fb.textContent = 'Exported hero JSON copied to clipboard!';
      }
      return;
    }
    const delBtn = e.target.closest('[data-ch-del]');
    if (delBtn) {
      const res = await api.customHeroDelete(delBtn.dataset.chDel);
      if (res?.state) applyFullState(res.state);
      if (fb) fb.textContent = 'Custom hero deleted.';
    }
  });

  drawHeroCreatorPreview();

  setInterval(renderTimersOnly, 1000);
  api.getInitialState().then((data) => applyFullState(data)).catch(() => {});
})();
