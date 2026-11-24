(function () {
  const api = window.petFishAPI;
  const hud = document.getElementById('hud');

  const SKIN_CATALOG = {
    vesper: [
      { id: 'crimson', label: 'Crimson Volt', color: '#e11d48' },
      { id: 'obsidian', label: 'Obsidian Flux', color: '#1e293b' },
      { id: 'eclipse', label: 'Eclipse Mono', color: '#475569' },
      { id: 'gilded', label: 'Gilded Pulse', color: '#eab308' },
      { id: 'frost', label: 'Frost Prism', color: '#ec4899' },
      { id: 'emerald', label: 'Emerald Drift', color: '#10b981' },
    ],
    vector: [
      { id: 'valkyrie', label: 'Valkyrie Gold', color: '#d97706' },
      { id: 'titanium', label: 'Titanium Aero', color: '#cbd5e1' },
      { id: 'cobalt', label: 'Cobalt Heavy', color: '#2563eb' },
      { id: 'orbital', label: 'Orbital Pearl', color: '#f8fafc' },
      { id: 'stealth', label: 'Midnight Ion', color: '#1e293b' },
    ],
    core: [
      { id: 'solar', label: 'Solar Amber', color: '#f59e0b' },
      { id: 'aether', label: 'Aether Cyan', color: '#38bdf8' },
      { id: 'matrix', label: 'Emerald Matrix', color: '#10b981' },
      { id: 'nova', label: 'Crimson Nova', color: '#e11d48' },
      { id: 'pearl', label: 'Pearl Glass', color: '#e2e8f0' },
    ],
    coral: [
      { id: 'tangerine', label: 'Tangerine', color: '#f97316' },
      { id: 'sapphire', label: 'Sapphire Tide', color: '#2563eb' },
      { id: 'koi', label: 'Pearl Koi', color: '#f59e0b' },
      { id: 'blossom', label: 'Blossom', color: '#ec4899' },
    ],
  };

  const state = {
    viewMode: 'mini',
    settings: {
      displayMode: 'floating',
      wakeOnAlerts: true,
      showAlertBubbles: true,
      privacyMask: false,
      voiceEnabled: true,
      bgmEnabled: true,
      autoStart: false,
      thinkMode: false,
      ageGroup: '15-30',
      glassTransparency: 42,
      fishScale: 1.06,
      petMode: 'swim',
      petCharacter: 'vesper',
      petSkins: { vesper: 'crimson', vector: 'valkyrie', core: 'solar', coral: 'tangerine' },
      petNames: { vesper: 'Vesper', vector: 'Vector', core: 'Core', coral: 'Coral' },
    },
    petMode: 'swim',
    petCharacter: 'vesper',
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
    const c = ch || state.petCharacter || 'vesper';
    return state.settings.petNames?.[c] || { vesper: 'Vesper', vector: 'Vector', core: 'Core', coral: 'Coral' }[c] || 'OV';
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
    if (charKey === 'coral') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><path d="M8 14C5 9.5 2.5 10.5 3 14C2.5 17.5 5 18.5 8 14Z" fill="${pal.dark}"/><ellipse cx="16.5" cy="14" rx="8" ry="5.5" fill="${pal.main}"/><circle cx="14.5" cy="12.5" r="2" fill="#fff" opacity="0.8"/><circle cx="20.6" cy="12.8" r="1.3" fill="#0b1324"/></svg>`;
    }
    if (charKey === 'core') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="${pal.main}" stroke-width="1.3" stroke-dasharray="5 3"/><circle cx="14" cy="14" r="5.5" fill="${pal.main}" fill-opacity="0.35" stroke="#fff" stroke-width="1.1"/><circle cx="14" cy="14" r="2.2" fill="#fff"/></svg>`;
    }
    if (charKey === 'vector') {
      return `<svg class="agent-mascot-svg" viewBox="0 0 28 28" fill="none"><rect x="5.5" y="5" width="17" height="18" rx="7" fill="${pal.main}"/><rect x="8" y="9" width="12" height="8" rx="4" fill="#0c1424"/><rect x="10" y="12" width="3" height="2" rx="1" fill="#38bdf8"/><rect x="15" y="12" width="3" height="2" rx="1" fill="#38bdf8"/></svg>`;
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
    const ch = ['vesper', 'vector', 'core', 'coral'].includes(state.petCharacter) ? state.petCharacter : 'vesper';
    document.body.dataset.theme = ch;
    applyGlassTransparency(state.settings.glassTransparency);

    const activeAgents = state.agents.filter((a) => a.status === 'running' || a.status === 'waiting_approval');
    const unread = state.notifications.filter((n) => n.unread);
    const ramMB = state.pulse?.vitals?.appRamMB || 0;
    const activeName = getCharName(ch);

    document.getElementById('header-pill').textContent = ramMB > 0 ? `${ramMB} MB` : 'Lean';
    document.getElementById('hud-subtitle').textContent =
      state.viewMode === 'deep'
        ? `${activeName} · ${state.llm?.activeLabel || 'Local AI'}`
        : `${activeName} · ${activeAgents.length} active`;

    // Sync custom character names across Mini strip & Studio cards
    document.querySelectorAll('.char-chip').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.char === ch);
      btn.textContent = getCharName(btn.dataset.char);
    });
    document.querySelectorAll('.pet-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.char === ch);
    });
    document.querySelectorAll('[data-char-label]').forEach((el) => {
      el.textContent = getCharName(el.dataset.charLabel);
    });
    document.getElementById('studio-active-label').textContent = activeName;
    const renameInp = document.getElementById('rename-input');
    if (document.activeElement !== renameInp) renameInp.value = activeName;

    renderSystemControls();

    // Mini View Cards
    const appSlot = document.getElementById('mini-approval-slot');
    if (state.approvals.length > 0) {
      const topApp = state.approvals[0];
      appSlot.classList.remove('hidden');
      appSlot.innerHTML = `<div class="mini-pulse-card urgent"><div class="mini-pulse-top"><span class="mini-pulse-label"><span class="agent-dot" style="background:#f5a623"></span>${escapeHtml(topApp.agent)} · ${escapeHtml(topApp.toolName)}</span><span class="section-meta">${state.approvals.length} pending</span></div><div class="mini-pulse-text">${escapeHtml(topApp.detail || topApp.title)}</div><div class="card-actions" style="margin-top:3px"><button class="mini-btn allow" data-act="allow" data-id="${escapeHtml(topApp.id)}">Allow</button><button class="mini-btn deny" data-act="deny" data-id="${escapeHtml(topApp.id)}">Deny</button></div></div>`;
    } else { appSlot.classList.add('hidden'); appSlot.innerHTML = ''; }

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
    const agentBadgeCount = state.approvals.length || activeAgents.length;
    tabAgentsBadge.textContent = String(agentBadgeCount);
    tabAgentsBadge.classList.toggle('hidden', agentBadgeCount === 0);
    tabAgentsBadge.classList.toggle('urgent', state.approvals.length > 0);

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

    // Active Agents + Auto-Collapsed Stopped Agents
    const runningAgents = state.agents.filter((a) => a.status === 'running' || a.status === 'waiting_approval');
    const stoppedAgents = state.agents.filter((a) => a.status !== 'running' && a.status !== 'waiting_approval');
    document.getElementById('agents-meta').textContent = `${runningAgents.length} active · ${stoppedAgents.length} stopped`;

    document.getElementById('agents-list').innerHTML = runningAgents.length === 0
      ? `<div class="empty-state">All agents are resting. Launch any coding agent to see live telemetry here.</div>`
      : runningAgents.map((ag) => {
          const pal = getAgentPalette(ag);
          const elapsedStart = ag.turnStartedAt || ag.startedAt;
          const pct = ag.stepsProgress ? Math.round((ag.stepsProgress.done / Math.max(1, ag.stepsProgress.total)) * 100) : 0;
          return `
          <div class="card">
            <div class="card-top">
              <div class="card-title-wrap">
                <div class="agent-stage active">${renderAgentMascotSvg(pal, ch)}<span class="synth-bars" style="color:${pal.main}"><span></span><span></span><span></span></span></div>
                <span class="card-name">${escapeHtml(ag.name)}</span>
              </div>
              <div class="card-right-meta">
                ${elapsedStart ? `<span class="elapsed-pill" data-elapsed-start="${elapsedStart}">${formatElapsed(elapsedStart)}</span>` : ''}
                <span class="status-tag running"><span class="status-dot"></span>Live</span>
              </div>
            </div>
            <div class="brief-box">
              <div class="brief-row"><span class="brief-key" style="color:${pal.main}">WHAT</span><span class="brief-val">${escapeHtml((ag.what || ag.task || 'Active').slice(0, 128))}</span></div>
              ${ag.how ? `<div class="brief-row"><span class="brief-key how">HOW</span><span class="brief-val muted">${escapeHtml(ag.how.slice(0, 108))}</span></div>` : ''}
              ${ag.why ? `<div class="brief-row"><span class="brief-key why">WHY</span><span class="brief-val muted">${escapeHtml(ag.why.slice(0, 92))}</span></div>` : ''}
              ${ag.stepsProgress ? `<div class="step-bar-wrap"><div class="step-bar"><div class="step-bar-fill" style="width:${pct}%;background:${pal.main}"></div></div><span class="step-bar-txt">${ag.stepsProgress.done}/${ag.stepsProgress.total}</span></div>` : ''}
            </div>
            <div class="card-foot">
              <span style="color:${pal.main}">✦ ${escapeHtml(pal.vibe)}</span>
              <button class="mini-btn" data-focus="${escapeHtml(ag.processHint || ag.name)}">Focus</button>
            </div>
          </div>`;
        }).join('');

    const idleSec = document.getElementById('idle-agents-section');
    if (stoppedAgents.length > 0) {
      idleSec.classList.remove('hidden');
      document.getElementById('idle-agents-meta').textContent = `${stoppedAgents.length}`;
      document.getElementById('idle-agents-list').innerHTML = stoppedAgents.map((ag) => {
        const pal = getAgentPalette(ag);
        const exp = state.expandedIdleAgents.has(ag.id);
        return `<div><div class="idle-agent-row" data-toggle-idle="${escapeHtml(ag.id)}"><div class="idle-agent-left"><div class="agent-stage">${renderAgentMascotSvg(pal, ch)}<span class="agent-stop-bubble">Stop.</span></div><span class="idle-agent-name">${escapeHtml(ag.name)}</span><span class="idle-agent-summary">${escapeHtml((ag.what || ag.task || 'Done').slice(0, 44))}</span></div><span class="section-meta">${exp ? '▴' : '▾'}</span></div>${exp ? `<div class="idle-agent-expand"><div>${escapeHtml(ag.what || ag.task || 'Completed')}</div><div style="margin-top:5px;display:flex;justify-content:space-between"><span class="section-meta">${formatRelativeTime(ag.updatedAt)}</span><button class="mini-btn" data-focus="${escapeHtml(ag.processHint || ag.name)}">Focus</button></div></div>` : ''}</div>`;
      }).join('');
    } else idleSec.classList.add('hidden');

    // Open Windows
    const wins = state.pulse?.windows || [];
    document.getElementById('windows-list').innerHTML = wins.length === 0
      ? `<div class="empty-state">No browser or app tabs captured yet.</div>`
      : wins.slice(0, 5).map((w) => `<div class="window-row" data-focus="${escapeHtml(w.processName)}"><div class="window-left"><span class="window-app-tag">${escapeHtml(w.app)}</span><span class="window-title">${escapeHtml(w.title)}</span></div><span class="section-meta">↗</span></div>`).join('');

    // Chat Tab (Saved Chat + Thinking Model + Voice Toggle)
    const select = document.getElementById('model-select');
    const models = state.llm?.models || [];
    select.innerHTML = models.length > 0
      ? models.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === (state.llm.selectedModel || models[0].id) ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')
      : `<option value="">Start Ollama (:11434)</option>`;

    const thinkBtn = document.getElementById('btn-think-mode');
    thinkBtn.classList.toggle('active', Boolean(state.settings.thinkMode));
    thinkBtn.textContent = state.settings.thinkMode ? '🧠 Think' : '⚡ Fast';
    document.getElementById('btn-voice-toggle').classList.toggle('active', Boolean(state.settings.voiceEnabled));

    const hist = state.llm?.history || [];
    document.getElementById('chat-feed').innerHTML = hist.length === 0 && !state.llm?.isThinking
      ? `<div class="empty-state">Your chat is saved locally.<br/>Press <strong>A+S+D</strong> together anytime to wake ${escapeHtml(activeName)}, toggle <strong>🧠 Think</strong> for step-by-step reasoning, or use <strong>Wispr Flow</strong> voice dictation!</div>`
      : hist.map((m, idx) => `
          <div class="chat-msg ${escapeHtml(m.role)}">
            ${m.thinking ? `<details class="think-details"><summary>Thought Process</summary><div style="margin-top:4px;white-space:pre-wrap">${escapeHtml(m.thinking)}</div></details>` : ''}
            <div>${escapeHtml(m.content)}</div>
            ${m.role === 'assistant' ? `<div class="chat-foot"><span>${m.action ? `<span class="chat-action-pill">${escapeHtml(m.action.type)}</span>` : ''}</span><button class="icon-btn tiny" data-speak-idx="${idx}" type="button" title="Speak aloud">🔊</button></div>` : ''}
          </div>`).join('') + (state.llm?.isThinking ? `<div class="chat-msg assistant">▍ ${escapeHtml(state.llm.activeLabel)} ${state.settings.thinkMode ? 'deep thinking...' : 'thinking...'}</div>` : '');

    // Music Player Card
    const mus = state.music || {};
    document.getElementById('mp-track').textContent = mus.title || (mus.bgmLoopActive ? `${activeName} Built-In BGM` : 'No track playing');
    document.getElementById('mp-artist').textContent = mus.artist ? `${mus.artist} · ${mus.source}` : (mus.bgmLoopActive ? 'Offline polyphonic loop active' : 'Play Spotify, YouTube, or Character BGM');
    document.getElementById('mp-source-meta').textContent = mus.isPlaying ? `${mus.source || 'Playing'} ♪` : (mus.bgmLoopActive ? 'Theme BGM ♪' : 'Idle');
    const bgmBtn = document.getElementById('btn-bgm-loop');
    bgmBtn.classList.toggle('active', Boolean(mus.bgmLoopActive));
    bgmBtn.textContent = mus.bgmLoopActive ? '♫ Theme BGM: On' : '♫ Theme BGM: Off';

    // Clipboard Vault
    const cbs = state.clipboard || [];
    document.getElementById('clipboard-list').innerHTML = cbs.length === 0
      ? `<div class="empty-state">Copy any text or code — appears here for 1-click Copy/Paste or AI Lens explain.</div>`
      : cbs.slice(0, 6).map((c) => `
        <div class="cb-item">
          <span class="cb-preview" data-cb-copy="${escapeHtml(c.id)}" title="Click to copy back">${c.pinned ? '📌 ' : ''}${escapeHtml(c.preview)}</span>
          <div class="task-actions">
            <button class="icon-btn tiny" data-cb-pin="${escapeHtml(c.id)}" type="button" title="Pin">${c.pinned ? '★' : '☆'}</button>
            <button class="icon-btn tiny" data-cb-del="${escapeHtml(c.id)}" type="button" title="Remove">×</button>
          </div>
        </div>`).join('');

    // Focus XP + Reminders + Editable Tasks
    const fs = state.autoPilot?.focusStats || { xp: 0, level: 1, streakDays: 1 };
    document.getElementById('focus-xp-meta').textContent = `Lv.${fs.level || 1} · ${fs.xp || 0} XP · 🔥 ${fs.streakDays || 1}d`;

    const rems = state.autoPilot?.reminders || [];
    document.getElementById('reminders-count').textContent = `${rems.length} active`;
    document.getElementById('reminders-list').innerHTML = rems.length === 0
      ? `<span class="section-meta" style="padding:2px">Say "remind me in 10m to..." or add above.</span>`
      : rems.map((r) => {
          const leftMin = Math.max(1, Math.ceil((r.dueAt - Date.now()) / 60000));
          return `<div class="task-item"><span class="task-text">⏰ ${escapeHtml(r.text)}</span><div class="task-actions"><span class="elapsed-pill">${leftMin}m</span><button class="icon-btn tiny" data-del-rem="${escapeHtml(r.id)}" type="button">×</button></div></div>`;
        }).join('');

    const tasks = state.autoPilot?.tasks || [];
    document.getElementById('tasks-count').textContent = `${tasks.filter((t) => !t.done).length} open`;
    document.getElementById('tasks-list').innerHTML = tasks.length === 0
      ? `<div class="empty-state">No tasks yet — synced two-way with Mobile APK.</div>`
      : tasks.map((t) => state.editingTaskId === t.id
          ? `<div class="task-item"><input class="task-edit-input" data-edit-input="${escapeHtml(t.id)}" value="${escapeHtml(t.text)}" /><div class="task-actions"><button class="mini-btn primary" data-save-task="${escapeHtml(t.id)}" type="button">Save</button><button class="icon-btn tiny" data-cancel-edit="1" type="button">×</button></div></div>`
          : `<div class="task-item ${t.done ? 'done' : ''}"><div class="task-item-left" data-toggle-task="${escapeHtml(t.id)}"><span>${t.done ? '☑' : '☐'}</span><span class="task-text">${escapeHtml(t.text)}</span></div><div class="task-actions"><button class="icon-btn tiny" data-edit-task="${escapeHtml(t.id)}" type="button">✎</button><button class="icon-btn tiny" data-del-task="${escapeHtml(t.id)}" type="button">×</button></div></div>`).join('');

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
            <div class="card-foot"><span>Click to open app ↗</span><div class="card-actions">${n.unread ? `<button class="mini-btn" data-read-notif="${escapeHtml(n.id)}">✓</button>` : ''}<button class="mini-btn" data-dismiss-notif="${escapeHtml(n.id)}">×</button></div></div>
          </div>`).join('');

    // Studio Tab: Skin Swatches, Age Group, Sliders, Toggles, Mobile Remote
    const curSkin = state.settings.petSkins?.[ch] || SKIN_CATALOG[ch][0].id;
    document.getElementById('skin-swatches').innerHTML = (SKIN_CATALOG[ch] || [])
      .map((sk) => `<button class="skin-swatch ${sk.id === curSkin ? 'active' : ''}" data-skin="${escapeHtml(sk.id)}" type="button"><span class="swatch-dot" style="background:${safeColor(sk.color, '#60a5fa')}"></span>${escapeHtml(sk.label)}</button>`)
      .join('');

    document.querySelectorAll('.seg-btn[data-age]').forEach((b) => b.classList.toggle('active', b.dataset.age === (state.settings.ageGroup || '15-30')));
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

  // Spotlight cursor glow
  hud.addEventListener('mousemove', (e) => {
    const t = e.target.closest('.card, .cc-tile, .dock-btn');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    t.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
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

  // Character Switching (All 4!)
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
    applyFullState(await api.saveSettings({ ageGroup: b.dataset.age }));
    showCommandFeedback(`Age style → ${b.dataset.age}`);
  }));
  document.getElementById('range-trans').addEventListener('input', (e) => applyGlassTransparency(Number(e.target.value)));
  document.getElementById('range-trans').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ glassTransparency: Number(e.target.value) })));
  document.getElementById('range-size').addEventListener('input', (e) => { document.getElementById('size-label').textContent = `${Math.round(Number(e.target.value) * 100)}%`; });
  document.getElementById('range-size').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ fishScale: Number(e.target.value) })));

  document.getElementById('toggle-voice').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ voiceEnabled: e.target.checked })));
  document.getElementById('toggle-bgm').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ bgmEnabled: e.target.checked })));
  document.getElementById('toggle-autostart').addEventListener('change', async (e) => {
    applyFullState(await api.saveSettings({ autoStart: e.target.checked }));
    showCommandFeedback(e.target.checked ? 'Auto-start with Windows ON' : 'Manual startup mode');
  });
  document.getElementById('toggle-desktop-only').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ displayMode: e.target.checked ? 'desktop-only' : 'floating' })));
  document.getElementById('toggle-privacy-mask').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ privacyMask: e.target.checked })));
  document.getElementById('toggle-wake-alerts').addEventListener('change', async (e) => applyFullState(await api.saveSettings({ wakeOnAlerts: e.target.checked })));
  document.getElementById('btn-test-voice').addEventListener('click', () => {
    api.speakText(`Hello! ${getCharName()} voice check — ready to work with you.`);
    showCommandFeedback(`Speaking as ${getCharName()}...`);
  });

  // Chat Controls & Focus Lens
  document.getElementById('model-select').addEventListener('change', async (e) => { if (e.target.value) applyFullState(await api.setLLMModel(e.target.value)); });
  document.getElementById('btn-think-mode').addEventListener('click', async () => {
    applyFullState(await api.setThinkMode(!state.settings.thinkMode));
    showCommandFeedback(state.settings.thinkMode ? 'Deep Thinking Model ON 🧠' : 'Fast Mode ON ⚡');
  });
  document.getElementById('btn-voice-toggle').addEventListener('click', async () => {
    applyFullState(await api.saveSettings({ voiceEnabled: !state.settings.voiceEnabled }));
    showCommandFeedback(state.settings.voiceEnabled ? 'Voice replies ON 🔊' : 'Voice replies muted');
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
    showCommandFeedback(state.music?.bgmLoopActive ? `${getCharName()} Theme BGM playing ♪` : 'Theme BGM stopped');
  });
  document.getElementById('btn-theme-playlist').addEventListener('click', async () => {
    const res = await api.launchApp(`bgm-${state.petCharacter}`, {});
    showCommandFeedback(res?.ok ? `Opened ${res.label} in Brave` : 'Could not open playlist');
  });
  document.getElementById('btn-ctrl-dance').addEventListener('click', () => { api.dancePet(); showCommandFeedback('Dance mode ♪'); });
  document.getElementById('btn-pet-dance').addEventListener('click', () => { api.dancePet(); showCommandFeedback('Dance mode ♪'); });

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
    const speakBtn = e.target.closest('button[data-speak-idx]');
    if (speakBtn) { const msg = state.llm?.history?.[Number(speakBtn.dataset.speakIdx)]; if (msg?.content) api.speakText(msg.content); return; }
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

  // Mic Button: Focuses input cleanly for Wispr Flow dictation OR uses Web Speech if available
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = document.getElementById('btn-voice');
  voiceBtn.addEventListener('click', () => {
    const inp = document.getElementById('cmd-input');
    inp.focus();
    if (!SpeechRec) {
      showCommandFeedback('Input focused — hold your Wispr Flow hotkey to dictate!');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-IN';
    voiceBtn.classList.add('listening');
    showCommandFeedback('Listening (or use Wispr Flow hotkey)...');
    rec.onresult = (ev) => { const t = ev.results?.[0]?.[0]?.transcript || ''; if (t) executeInput(t); };
    rec.onerror = () => showCommandFeedback('Input focused — use Wispr Flow hotkey or type!');
    rec.onend = () => voiceBtn.classList.remove('listening');
    try { rec.start(); } catch { voiceBtn.classList.remove('listening'); }
  });

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

  setInterval(renderTimersOnly, 1000);
  api.getInitialState().then((data) => applyFullState(data)).catch(() => {});
})();
