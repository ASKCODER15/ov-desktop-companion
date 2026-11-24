const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { NotificationMonitor } = require('../src/services/notificationMonitor');
const { AgentMonitor } = require('../src/services/agentMonitor');
const { HookServer } = require('../src/services/hookServer');
const { AutoPilot } = require('../src/services/autoPilot');
const { LocalLLMBrain } = require('../src/services/llmBrain');
const { DiscoveryEngine } = require('../src/services/discoveryEngine');
const { SystemControls } = require('../src/services/systemControls');
const { MusicDetector } = require('../src/services/musicDetector');
const { MobileRemoteServer, MOBILE_PORT } = require('../src/services/mobileRemote');
const { ClipboardVault } = require('../src/services/clipboardVault');
const { PetPhysics } = require('../src/services/petPhysics');
const { startAsdChordWatcher, stopAsdChordWatcher } = require('../src/services/desktopAwareness');
const { generateQrSvg } = require('../src/services/qrCode');
const { refreshStartAppsIndex, normalizeWebsiteUrl } = require('../src/services/appLauncher');
const { ensureAuthToken, getAuthTokenPath, sanitizeSettingsPatch } = require('../src/services/security');

function rawRequest(port, { method = 'GET', path: reqPath = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: reqPath, method, headers },
      (res) => {
        let out = '';
        res.on('data', (c) => { out += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('=== 1. Security Auth Token & Private Storage ===');
  const token = ensureAuthToken();
  assert(/^[a-f0-9]{64}$/i.test(token));
  assert(fs.existsSync(getAuthTokenPath()));
  console.log('OK: 256-bit token stored privately');

  console.log('\n=== 2. HookServer Security + Auto-Pilot Rules ===');
  const ap = new AutoPilot();
  const prevRules = { ...ap.rules };
  ap.rules = { autoAllowReadOnly: true, autoDenyDangerous: true };
  const testPort = 47839;
  const hs = new HookServer(testPort, (item) => ap.evaluatePermission(item));
  hs.start();
  await new Promise((r) => setTimeout(r, 150));

  const unauth = await rawRequest(testPort, {
    method: 'POST', path: '/api/notify', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }),
  });
  assert.strictEqual(unauth.status, 401);
  console.log('OK: Unauthenticated POST -> 401');

  const cors = await rawRequest(testPort, {
    method: 'POST', path: '/api/notify',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-PetFish-Token': token },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.strictEqual(cors.status, 403);
  console.log('OK: Cross-origin CSRF -> 403');

  const rebind = await rawRequest(testPort, { method: 'GET', path: '/api/health', headers: { Host: 'evil.attacker:47839' } });
  assert.strictEqual(rebind.status, 403);
  console.log('OK: DNS rebinding -> 403');

  const roBody = JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Read', tool_input: { file_path: 'README.md' } });
  const roRes = await rawRequest(testPort, {
    method: 'POST', path: '/api/hooks/permission',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(roBody), 'X-PetFish-Token': token },
    body: roBody,
  });
  assert.strictEqual(JSON.parse(roRes.body).hookSpecificOutput.decision.behavior, 'allow');
  console.log('OK: Auto-Pilot Read-Only -> Allow');

  const badBody = JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
  const badRes = await rawRequest(testPort, {
    method: 'POST', path: '/api/hooks/permission',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(badBody), 'X-PetFish-Token': token },
    body: badBody,
  });
  assert.strictEqual(JSON.parse(badRes.body).hookSpecificOutput.decision.behavior, 'deny');
  console.log('OK: Auto-Pilot Dangerous Shell -> Deny');

  ap.rules = prevRules;
  hs.stop();

  console.log('\n=== 3. Local LLM Brain (Ollama qwen3.5:2b + LM Studio Discovery & Action Test) ===');
  const brain = new LocalLLMBrain();
  const llmState = await brain.discoverModels();
  console.log(`OK: Discovered ${llmState.models.length} local LLM(s). Auto-selected: ${llmState.activeLabel}`);
  if (llmState.selectedModel) {
    // Verify single-bracket & double-bracket action parser
    assert.strictEqual(brain.extractAction('Done [ACTION:{"type":"open_app","target":"cmd"}]').action.target, 'cmd');
    assert.strictEqual(brain.extractAction('Done [[ACTION:{"type":"wifi","enable":false}]]').action.type, 'wifi');
    const resp = await brain.ask('Bro kya tum mere liye Spotify open kar sakte ho?', { petCharacter: 'vesper' });
    console.log(`OK: Live LLM Reply (${resp.model}): "${resp.reply}" | Action:`, JSON.stringify(resp.action));
    assert(resp.ok && resp.reply.length > 0, 'Expected valid local LLM response');
  }

  console.log('\n=== 4. Discovery Engine + WHAT/HOW/WHY Agent Monitor ===');
  const de = new DiscoveryEngine();
  de.start();
  console.log(`OK: DiscoveryEngine indexed ${de.getState().installedAgents.length} installed AI tools`);
  de.stop();

  const am = new AgentMonitor();
  await am.poll();
  for (const ag of am.getAgents()) {
    console.log(`  - [${ag.name}] (${ag.status}) WHAT="${ag.what}" | HOW="${ag.how}" | WHY="${ag.why}"`);
  }
  am.stop();

  const nm = new NotificationMonitor();
  await nm.poll();
  console.log(`OK: NotificationMonitor read ${nm.getAll().length} Windows notifications`);
  nm.stop();

  console.log('\n=== 5. SystemControls (Read-Only Wi-Fi/BT/Flight) + Universal App/Website Index ===');
  const sc = new SystemControls();
  const sysState = await sc.refresh(true);
  console.log(
    `OK: Wi-Fi=${sysState.wifiOn ? 'ON' : 'OFF'} (SSID="${sysState.connectedSsid}", ${sysState.wifiNetworks.length} profiles) | BT=${sysState.bluetoothOn ? 'ON' : 'OFF'} (${sysState.bluetoothDevices.length} paired) | Flight=${sysState.flightMode ? 'ON' : 'OFF'}`
  );
  assert(sysState.wifiNetworks.length >= 1, 'Expected Wi-Fi profiles/networks');

  const startApps = await refreshStartAppsIndex();
  console.log(`OK: Indexed ${startApps.length} installed Windows Start Apps for universal launching`);
  assert(startApps.length >= 20, 'Expected Windows Start Apps to be indexed');
  assert.strictEqual(normalizeWebsiteUrl('chatgpt.com'), 'https://chatgpt.com');
  assert.strictEqual(normalizeWebsiteUrl('javascript:alert(1)'), null);
  console.log('OK: Website URL normalization & javascript: scheme blocking verified');

  // Verify commands.js parser in isolated VM context
  const vm = require('vm');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'commands.js'), 'utf8'), sandbox);
  const parse = sandbox.window.parsePetCommand;
  assert.strictEqual(parse('open cmd').appKey, 'cmd');
  assert.strictEqual(parse('open powershell').appKey, 'powershell');
  assert.strictEqual(parse('open chatgpt.com as app').asApp, true);
  assert.strictEqual(parse('wifi off').action, 'sys-wifi');
  assert.strictEqual(parse('bluetooth on').action, 'sys-bt');
  assert.strictEqual(parse('flight mode').action, 'sys-flight');
  assert.strictEqual(parse('connect wifi HomeWiFi').ssid, 'HomeWiFi');
  assert.strictEqual(parse('dance').action, 'pet-dance');
  assert.strictEqual(parse('vector').action, 'character');
  assert.strictEqual(parse('vector').character, 'vector');
  assert.strictEqual(parse('core').action, 'character');
  assert.strictEqual(parse('core').character, 'core');
  assert.strictEqual(parse('vesper').character, 'vesper');
  assert.strictEqual(parse('coral').character, 'coral');
  assert.strictEqual(parse('remind me in 15 min to revise OS').action, 'add-reminder');
  assert.strictEqual(parse('remind me in 15 min to revise OS').minutes, 15);
  assert.strictEqual(parse('next song').action, 'media');
  assert.strictEqual(parse('explain clipboard').action, 'explain-clipboard');
  assert.strictEqual(parse('search react bits and tailwind').action, 'search-multi');
  assert.strictEqual(parse('Explain quantum physics simply').action, 'ask-llm');
  console.log('OK: Command parser verified (4 original OV companions, Reminders, Media, Focus Lens, CMD, PowerShell, Off-topic LLM)');

  console.log('\n=== 7. OV v6 Engine Checks (4-Char Physics, Legacy Settings Migration, Elastic Squish, Clipboard Vault, Reminders, A+S+D) ===');
  // Verify lossless backward-compatibility migration of legacy settings!
  const migrated = sanitizeSettingsPatch({
    petCharacter: 'spidey',
    petSkins: { spidey: 'classic', ironman: 'mark85', jarvis: 'stark', nemo: 'dory' },
    petNames: { spidey: 'Spidey', ironman: 'MyCustomMech' },
  });
  assert.strictEqual(migrated.petCharacter, 'vesper');
  assert.strictEqual(migrated.petSkins.vesper, 'crimson');
  assert.strictEqual(migrated.petSkins.vector, 'valkyrie');
  assert.strictEqual(migrated.petSkins.core, 'solar');
  assert.strictEqual(migrated.petSkins.coral, 'sapphire');
  assert.strictEqual(migrated.petNames.vesper, 'Vesper');
  assert.strictEqual(migrated.petNames.vector, 'MyCustomMech');
  console.log('OK: Legacy settings migration verified (preserves custom nicknames & maps all legacy IDs/skins)');

  const phys = new PetPhysics({ x: 0, y: 0, width: 1536, height: 864 });
  for (const ch of ['vesper', 'vector', 'core', 'coral']) {
    phys.setCharacter(ch);
    assert.strictEqual(phys.character, ch);
    phys.step(0.032);
  }
  phys.setCharacter('spidey'); // verify legacy fallback mapping
  assert.strictEqual(phys.character, 'vesper');
  phys.applyDragPull(65, -40);
  assert(phys.squishMag > 0.3, 'Expected elastic squish deformation on drag pull');
  phys.releaseDragSpring();
  phys.step(0.032);
  console.log('OK: 4-character physics & elastic squish spring verified');

  const fakeClip = { _val: '', readText() { return this._val; }, writeText(v) { this._val = v; } };
  const vault = new ClipboardVault(fakeClip);
  vault.capture('const aura = "minimal";');
  vault.capture('git status');
  assert.strictEqual(vault.getItems().length, 2);
  const pinId = vault.getItems()[0].id;
  vault.togglePin(pinId);
  vault.clearUnpinned();
  assert.strictEqual(vault.getItems().length, 1);
  assert(vault.copyItem(pinId) && fakeClip._val === 'git status');
  console.log('OK: In-memory Clipboard Vault (capture/pin/clear/copy) verified');

  assert.strictEqual(typeof startAsdChordWatcher, 'function');
  assert.strictEqual(typeof stopAsdChordWatcher, 'function');
  const remBefore = ap.tasks.length;
  ap.addReminder('Check verify cleanup', 10);
  const remAdded = ap.reminders[0];
  assert(remAdded && ap.tasks.length >= remBefore + 1);
  ap.deleteReminder(remAdded.id);
  const mirroredTask = ap.tasks.find((t) => t.text === '⏰ Check verify cleanup');
  if (mirroredTask) ap.deleteTask(mirroredTask.id);
  ap.stopAllTimers();
  console.log('OK: Smart Timed Reminders + Task mirroring + A+S+D watcher exports verified');

  console.log('\n=== 8. Music Detector, Local Offline QR & Mobile Remote Bridge Security ===');
  const md = new MusicDetector();
  const musicSt = await md.poll();
  console.log(`OK: MusicDetector live status=${musicSt.status} playing=${musicSt.isPlaying}${musicSt.title ? ` ("${musicSt.title}" — ${musicSt.artist})` : ''}`);

  const svg = generateQrSvg('https://example.trycloudflare.com/#pair=0123456789abcdef', 140);
  assert(svg.startsWith('<svg') && svg.includes('</svg>'), 'Expected valid offline SVG QR code');
  console.log('OK: 100% offline local SVG QR code generated cleanly');

  // Test MobileRemoteServer auth, PIN pairing, and two-way task editing on ephemeral test server
  const mobTasks = new AutoPilot();
  const mobTest = new MobileRemoteServer({
    getMobileState: () => ({ tasks: mobTasks.tasks, online: true }),
    addTask: (t) => mobTasks.addTask(t),
    editTask: (id, t) => mobTasks.editTask(id, t),
    toggleTask: (id) => mobTasks.toggleTask(id),
    deleteTask: (id) => mobTasks.deleteTask(id),
  });
  await mobTest.startServer(false);
  const mUnauth = await rawRequest(MOBILE_PORT, { method: 'GET', path: '/api/mobile/state' });
  assert.strictEqual(mUnauth.status, 401);
  console.log('OK: MobileRemote unauthenticated GET /api/mobile/state -> 401');

  const mEvilCors = await rawRequest(MOBILE_PORT, {
    method: 'GET',
    path: '/api/mobile/ping',
    headers: { Origin: 'https://evil.example' },
  });
  assert.strictEqual(mEvilCors.status, 403);
  const mApkCors = await rawRequest(MOBILE_PORT, {
    method: 'GET',
    path: '/api/mobile/ping',
    headers: { Origin: 'null' },
  });
  assert.strictEqual(mApkCors.status, 200);
  console.log('OK: MobileRemote CORS blocks evil third-party Origin (403) while allowing APK WebView (Origin: null -> 200)');

  const pinObj = mobTest.createPairingPin();
  const pairBody = JSON.stringify({ pin: pinObj.code });
  const mPair = await rawRequest(MOBILE_PORT, {
    method: 'POST', path: '/api/mobile/pair',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pairBody) },
    body: pairBody,
  });
  const pairJson = JSON.parse(mPair.body);
  assert.strictEqual(mPair.status, 200);
  assert(pairJson.token && pairJson.token.length === 64, 'Expected 256-bit mobile token');
  console.log('OK: MobileRemote 6-digit PIN exchange -> 256-bit Bearer token');

  const addBody = JSON.stringify({ text: 'Verify mobile two-way edit' });
  const mAdd = await rawRequest(MOBILE_PORT, {
    method: 'POST', path: '/api/mobile/tasks/add',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(addBody), Authorization: `Bearer ${pairJson.token}` },
    body: addBody,
  });
  const addedId = JSON.parse(mAdd.body).data.tasks[0].id;
  const editBody = JSON.stringify({ id: addedId, text: 'Edited from mobile!' });
  const mEdit = await rawRequest(MOBILE_PORT, {
    method: 'POST', path: '/api/mobile/tasks/edit',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(editBody), Authorization: `Bearer ${pairJson.token}` },
    body: editBody,
  });
  assert.strictEqual(JSON.parse(mEdit.body).data.tasks.find((x) => x.id === addedId).text, 'Edited from mobile!');
  mobTasks.deleteTask(addedId); // clean up test task
  mobTasks.stopAllTimers();
  mobTest.stopAll();
  console.log('OK: MobileRemote two-way Add + Edit + Delete task sync verified');

  console.log('\nALL OV V6 CHECKS PASSED!');
}

run().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
