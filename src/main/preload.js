const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petFishAPI', {
  // Pet window events
  fishClicked: () => ipcRenderer.send('petfish:fish-clicked'),
  fishDoubleClicked: () => ipcRenderer.send('petfish:fish-dblclick'),
  fishContextMenu: () => ipcRenderer.send('petfish:fish-context'),
  fishDragStart: () => ipcRenderer.send('petfish:drag-start'),
  fishDragEnd: () => ipcRenderer.send('petfish:drag-end'),

  // HUD (Mini <-> Deep Dive), Toast & Picker controls
  closeHud: () => ipcRenderer.send('petfish:hud-close'),
  setHudPinned: (pinned) => ipcRenderer.send('petfish:hud-pin', Boolean(pinned)),
  setHudMode: (mode, tab) => ipcRenderer.send('petfish:hud-mode', { mode, tab }),
  openHudTab: (tab, mode) => ipcRenderer.send('petfish:hud-open-tab', { tab, mode }),
  closeToast: () => ipcRenderer.send('petfish:toast-close'),
  startSpotPicker: () => ipcRenderer.send('petfish:picker-start'),
  pickSpotResult: (x, y) => ipcRenderer.send('petfish:picker-result', { x, y }),
  cancelSpotPicker: () => ipcRenderer.send('petfish:picker-cancel'),

  //Movement & Pet character + Hero Creator
  setPetMode: (mode) => ipcRenderer.invoke('petfish:set-mode', mode),
  setPetCharacter: (character) => ipcRenderer.invoke('petfish:set-character', character),
  goToCorner: (corner, thenStay) => ipcRenderer.invoke('petfish:go-corner', { corner, thenStay }),
  petNemo: () => ipcRenderer.send('petfish:pet-nemo'),
  dancePet: () => ipcRenderer.send('petfish:pet-dance'),
  toggleDanceMode: (enable) => ipcRenderer.invoke('petfish:dance-toggle', enable),
  customHeroCreate: (payload) => ipcRenderer.invoke('petfish:hero-create', payload),
  customHeroUpdate: (id, patch) => ipcRenderer.invoke('petfish:hero-update', { id, patch }),
  customHeroRename: (id, name, nickname) => ipcRenderer.invoke('petfish:hero-rename', { id, name, nickname }),
  customHeroDuplicate: (id) => ipcRenderer.invoke('petfish:hero-duplicate', id),
  customHeroDelete: (id) => ipcRenderer.invoke('petfish:hero-delete', id),
  customHeroExport: (id) => ipcRenderer.invoke('petfish:hero-export', id),
  customHeroImport: (json) => ipcRenderer.invoke('petfish:hero-import', json),

  // State & Settings
  getInitialState: () => ipcRenderer.invoke('petfish:get-initial-state'),
  refreshAll: () => ipcRenderer.invoke('petfish:refresh-all'),
  saveSettings: (patch) => ipcRenderer.invoke('petfish:save-settings', patch),

  // Notifications & Approvals (click notification -> open exact source app!)
  markNotificationRead: (id) => ipcRenderer.invoke('petfish:notif-read', id),
  dismissNotification: (id) => ipcRenderer.invoke('petfish:notif-dismiss', id),
  openNotificationApp: (notif) => ipcRenderer.invoke('petfish:notif-open-app', notif),
  resolveApproval: (id, decision) => ipcRenderer.invoke('petfish:approval-resolve', { id, decision }),
  focusApp: (processHint) => ipcRenderer.invoke('petfish:focus-app', processHint),

  // Local LLM Brain (Ollama + LM Studio + Thinking Mode + Saved Chat + Per-Message Delete)
  askLLM: (prompt, opts) => ipcRenderer.invoke('petfish:llm-ask', { prompt, opts: opts || {} }),
  setLLMModel: (modelId) => ipcRenderer.invoke('petfish:llm-model', modelId),
  setThinkMode: (enabled) => ipcRenderer.invoke('petfish:llm-think', Boolean(enabled)),
  clearLLMChat: () => ipcRenderer.invoke('petfish:llm-clear'),
  deleteChatMsg: (idx) => ipcRenderer.invoke('petfish:llm-delete-msg', idx),
  explainClipboard: () => ipcRenderer.invoke('petfish:explain-clipboard'),

  // Voice TTS, Local Windows STT, Agent Announce & Native Copy Controls
  speakText: (text) => ipcRenderer.send('petfish:voice-speak', text),
  stopSpeaking: () => ipcRenderer.send('petfish:voice-stop'),
  listenVoice: () => ipcRenderer.invoke('petfish:voice-listen'),
  announceAgent: (agentId) => ipcRenderer.invoke('petfish:announce-agent', agentId || ''),
  copyText: (text) => ipcRenderer.invoke('petfish:copy-text', String(text || '')),
  playMotif: () => ipcRenderer.send('petfish:bgm-motif'),
  toggleBgmLoop: (enable) => ipcRenderer.invoke('petfish:bgm-loop', Boolean(enable)),
  mediaControl: (command) => ipcRenderer.invoke('petfish:media-control', command),

  // Copy & Paste Clipboard Vault + Smart Reminders
  clipboardCopy: (id) => ipcRenderer.invoke('petfish:cb-copy', id),
  clipboardPin: (id) => ipcRenderer.invoke('petfish:cb-pin', id),
  clipboardDelete: (id) => ipcRenderer.invoke('petfish:cb-delete', id),
  clipboardClear: () => ipcRenderer.invoke('petfish:cb-clear'),
  addReminder: (text, minutes) => ipcRenderer.invoke('petfish:rem-add', { text, minutes }),
  deleteReminder: (id) => ipcRenderer.invoke('petfish:rem-delete', id),

  // Daily Engineer Tools & Universal App / Website Launcher
  launchApp: (appKey, opts) => ipcRenderer.invoke('petfish:launch-app', { target: appKey, opts: opts || {} }),
  searchInBrave: (engine, query) => ipcRenderer.invoke('petfish:search-brave', { engine, query }),
  searchMulti: (queries) => ipcRenderer.invoke('petfish:search-multi', queries),
  openPort: (port) => ipcRenderer.invoke('petfish:open-port', port),

  // Worldwide Mobile Remote Bridge & Tunnel
  mobileStartLan: () => ipcRenderer.invoke('petfish:mobile-start-lan'),
  mobileStartTunnel: () => ipcRenderer.invoke('petfish:mobile-start-tunnel'),
  mobileStop: () => ipcRenderer.invoke('petfish:mobile-stop'),
  mobileRotateToken: () => ipcRenderer.invoke('petfish:mobile-rotate'),
  mobileNewPin: () => ipcRenderer.invoke('petfish:mobile-pin'),
  mobileSetCustomUrl: (url) => ipcRenderer.invoke('petfish:mobile-custom-url', url),
  mobileCopyLink: () => ipcRenderer.invoke('petfish:mobile-copy-link'),
  mobileOpenApkFolder: () => ipcRenderer.invoke('petfish:mobile-open-apk'),

  // System Controls (Wi-Fi ON/OFF + Connect, Bluetooth ON/OFF + Connect, Flight Mode, Mute, Lock)
  refreshSystemControls: () => ipcRenderer.invoke('petfish:sys-refresh'),
  toggleWifi: (enable) => ipcRenderer.invoke('petfish:sys-wifi-toggle', Boolean(enable)),
  connectWifi: (ssid) => ipcRenderer.invoke('petfish:sys-wifi-connect', ssid),
  disconnectWifi: () => ipcRenderer.invoke('petfish:sys-wifi-disconnect'),
  toggleBluetooth: (enable) => ipcRenderer.invoke('petfish:sys-bt-toggle', Boolean(enable)),
  connectBluetooth: (target, connect) => ipcRenderer.invoke('petfish:sys-bt-connect', { target, connect: connect !== false }),
  toggleFlightMode: (enable) => ipcRenderer.invoke('petfish:sys-flight-toggle', Boolean(enable)),
  toggleMute: () => ipcRenderer.invoke('petfish:sys-mute'),
  lockPC: () => ipcRenderer.invoke('petfish:sys-lock'),
  openSystemSettings: (uri) => ipcRenderer.invoke('petfish:sys-open-settings', uri),

  updateAutoPilotRules: (patch) => ipcRenderer.invoke('petfish:ap-rules', patch),
  addTask: (text) => ipcRenderer.invoke('petfish:task-add', text),
  editTask: (id, text) => ipcRenderer.invoke('petfish:task-edit', { id, text }),
  toggleTask: (id) => ipcRenderer.invoke('petfish:task-toggle', id),
  deleteTask: (id) => ipcRenderer.invoke('petfish:task-delete', id),
  startTimer: (minutes, label) => ipcRenderer.invoke('petfish:timer-start', { minutes, label }),
  stopTimer: () => ipcRenderer.invoke('petfish:timer-stop'),

  // Claude Code hooks & demo buttons
  installClaudeHooks: () => ipcRenderer.invoke('petfish:claude-hooks-install'),
  uninstallClaudeHooks: () => ipcRenderer.invoke('petfish:claude-hooks-uninstall'),
  triggerDemoApproval: () => ipcRenderer.invoke('petfish:demo-approval'),
  triggerDemoWhatsApp: () => ipcRenderer.invoke('petfish:demo-whatsapp'),
  quitApp: () => ipcRenderer.send('petfish:quit'),

  // Subscriptions
  onFishState: (cb) => {
    const fn = (_, data) => cb(data);
    ipcRenderer.on('petfish:fish-state', fn);
    return () => ipcRenderer.removeListener('petfish:fish-state', fn);
  },
  onFishReaction: (cb) => {
    const fn = (_, data) => cb(data);
    ipcRenderer.on('petfish:fish-reaction', fn);
    return () => ipcRenderer.removeListener('petfish:fish-reaction', fn);
  },
  onFullState: (cb) => {
    const fn = (_, data) => cb(data);
    ipcRenderer.on('petfish:full-state', fn);
    return () => ipcRenderer.removeListener('petfish:full-state', fn);
  },
  onHudView: (cb) => {
    const fn = (_, view) => cb(view);
    ipcRenderer.on('petfish:hud-view', fn);
    return () => ipcRenderer.removeListener('petfish:hud-view', fn);
  },
  onToastShow: (cb) => {
    const fn = (_, payload) => cb(payload);
    ipcRenderer.on('petfish:toast-show', fn);
    return () => ipcRenderer.removeListener('petfish:toast-show', fn);
  },
  onAudioCmd: (cb) => {
    const fn = (_, cmd) => cb(cmd);
    ipcRenderer.on('petfish:audio-cmd', fn);
    return () => ipcRenderer.removeListener('petfish:audio-cmd', fn);
  },
  onFocusChat: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('petfish:focus-chat', fn);
    return () => ipcRenderer.removeListener('petfish:focus-chat', fn);
  },
});
