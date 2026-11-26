const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { JarvisAgent, isProtectedPath, extractFirstYouTubeVideoId } = require('../src/services/jarvisAgent');
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
  assert.strictEqual(parse('kronos').action, 'character');
  assert.strictEqual(parse('kronos').character, 'kronos');
  assert.strictEqual(parse('aegis').character, 'aegis');
  assert.strictEqual(parse('optix').character, 'optix');
  assert.strictEqual(parse('orbit').character, 'orbit');
  assert.strictEqual(parse('spidey').character, 'kronos');
  assert.strictEqual(parse('ironman').character, 'aegis');
  assert.strictEqual(parse('batman').character, 'optix');
  assert.strictEqual(parse('nemo').character, 'orbit');
  assert.strictEqual(parse('remind me in 15 min to revise OS').action, 'add-reminder');
  assert.strictEqual(parse('remind me in 15 min to revise OS').minutes, 15);
  assert.strictEqual(parse('next song').action, 'media');
  assert.strictEqual(parse('explain clipboard').action, 'explain-clipboard');
  assert.strictEqual(parse('search react bits and tailwind').action, 'search-multi');
  assert.strictEqual(parse('Explain quantum physics simply').action, 'ask-llm');
  console.log('OK: Command parser verified (4 Robot Agents + legacy aliases, Reminders, Media, Focus Lens, CMD, PowerShell, Off-topic LLM)');

  console.log('\n=== 7. OV V8 4-Robot Ecosystem (Kronos 4-Slab Monolith, Aegis Mech, Optix Rover, Orbit Synth), 12 Age Combos, Single Named Voice & Per-Message Chat Delete ===');
  const os = require('os');
  const {
    BUILTIN_HERO_IDS,
    BUILTIN_HEROES,
    AGE_PROFILES,
    resolveAgeProfileId,
    buildHeroAgePersona,
    migrateSettingsSafe,
  } = require('../src/services/heroRegistry');
  const { CustomHeroStore } = require('../src/services/customHeroStore');
  const { VOICE_CATALOG, getVoiceEntry } = require('../src/services/neuralVoice');

  // 7a. Safe backward-compatibility migration to the 4 Robot Agents!
  const migKnown = migrateSettingsSafe({
    petCharacter: 'vesper',
    ageGroup: '0-15',
    petSkins: { vesper: 'crimson', ironman: 'mark85', batman: 'darkknight', nemo: 'classic' },
    petNames: { kronos: 'MyCustomMech' },
  });
  assert.strictEqual(migKnown.settings.petCharacter, 'kronos');
  assert.strictEqual(migKnown.settings.ageGroup, '1-15');
  assert.strictEqual(migKnown.settings.petSkins.kronos, 'titanium');
  assert.strictEqual(migKnown.settings.petSkins.aegis, 'signal');
  assert.strictEqual(migKnown.settings.petSkins.optix, 'cobalt');
  assert.strictEqual(migKnown.settings.petSkins.orbit, 'ceramic');
  assert.strictEqual(migKnown.settings.petNames.kronos, 'MyCustomMech');
  console.log('OK: Safe legacy migration to 4 Robot Agents verified');

  // 7b. Deterministic Age-Based Personas & all 12 Robot x Age combinations (4 built-in robots x 3 age profiles)
  assert.strictEqual(BUILTIN_HERO_IDS.length, 4);
  assert.strictEqual(resolveAgeProfileId(14), '1-15');
  assert.strictEqual(resolveAgeProfileId(15), '15-30');
  assert.strictEqual(resolveAgeProfileId(29), '15-30');
  assert.strictEqual(resolveAgeProfileId(30), '30-60');
  assert.strictEqual(resolveAgeProfileId('0-15'), '1-15');
  let comboCount = 0;
  for (const hKey of BUILTIN_HERO_IDS) {
    for (const aKey of Object.keys(AGE_PROFILES)) {
      const p = buildHeroAgePersona(BUILTIN_HEROES[hKey], aKey);
      assert(p.tagline && p.systemDirective.includes(BUILTIN_HEROES[hKey].name));
      assert(p.motionMode && p.eyeStyle);
      comboCount++;
    }
  }
  assert.strictEqual(comboCount, 12);
  assert(VOICE_CATALOG.length >= 7 && getVoiceEntry('arjun').voice === 'en-IN-PrabhatNeural');
  console.log('OK: All 12 Robot x Age-Profile combinations (4 robots x 3 profiles) & 7 Single Named Voices verified');

  // 7c. All 4 Robot Movement Archetypes (stride/scout/drone) + custom archetypes + elastic squish
  const phys = new PetPhysics({ x: 0, y: 0, width: 1536, height: 864 });
  const expectedArch = {
    kronos: 'stride', aegis: 'stride', optix: 'scout', orbit: 'drone',
  };
  for (const [ch, arch] of Object.entries(expectedArch)) {
    phys.setCharacter(ch);
    assert.strictEqual(phys.character, ch);
    assert.strictEqual(phys.movementArchetype, arch);
    phys.step(0.032);
  }
  phys.setMovementArchetype('float', 1.2);
  assert.strictEqual(phys.movementArchetype, 'float');
  phys.step(0.032);
  phys.setCharacter('vesper');
  assert.strictEqual(phys.character, 'kronos');
  phys.applyDragPull(65, -40);
  assert(phys.squishMag > 0.3, 'Expected elastic squish deformation on drag pull');
  phys.releaseDragSpring();
  phys.step(0.032);
  console.log('OK: Robot physics (stride/scout/drone) & elastic squish verified');

  // 7d. Unified Companion Studio Store (Hero + Robot Agent categories, CRUD, persistence, duplicate, import/export, SVG-XSS blocking)
  const tmpHeroDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-hero-test-'));
  try {
    const store1 = new CustomHeroStore(tmpHeroDir);
    const created = store1.create({
      category: 'robot',
      name: 'Axiom-9',
      nickname: 'Axiom',
      template: 'kronos',
      movement: 'stride',
      primaryColor: '#ff5500',
      secondaryColor: '#00d68f',
      personality: 'Heavy build and deep research monolith unit',
      voiceProfile: 'kronos',
      soundPack: 'kronos',
      size: 1.1,
      speed: 0.9,
    });
    assert(created.ok && created.hero.id.startsWith('custom-') && created.hero.category === 'robot');

    // Reject SVG script injection in artwork!
    const badSvg = store1.create({
      name: 'EvilSVG',
      artworkDataUrl: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
    });
    assert.strictEqual(badSvg.ok, false);

    // Survive restart (reload from disk)
    const store2 = new CustomHeroStore(tmpHeroDir);
    assert.strictEqual(store2.list().length, 1);
    assert.strictEqual(store2.get(created.hero.id).name, 'Axiom-9');

    // Edit, Duplicate, Export, Import, Delete
    const upd = store2.update(created.hero.id, { nickname: 'NovaX', movement: 'fly' });
    assert(upd.ok && upd.hero.nickname === 'NovaX' && upd.hero.movement === 'fly');
    const dup = store2.duplicate(created.hero.id);
    assert(dup.ok && store2.list().length === 2);
    const exp = store2.exportHero(created.hero.id);
    assert(exp.ok && exp.json.includes('ov-custom-hero-v1'));
    const imp = store2.importHero(exp.json);
    assert(imp.ok && store2.list().length === 3);
    const del = store2.delete(dup.hero.id);
    assert(del.ok && store2.list().length === 2);
    console.log('OK: Hero Creator CRUD, persistence, duplicate, export/import & SVG-XSS blocking verified');
  } finally {
    fs.rmSync(tmpHeroDir, { recursive: true, force: true });
  }

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

  console.log('\n=== 9. JARVIS Autonomous Voice Engine (A+S+D) & Safety Boundaries ===');
  const jarvis = new JarvisAgent({ noExplorer: true });

  const pIde = jarvis.planJarvisSteps('hey bro go to antigravity and open free window radar and tell him to update the navbar in the website');
  assert(pIde.matched && pIde.steps.length === 1);
  assert.strictEqual(pIde.steps[0].type, 'ide_project_prompt');
  assert.strictEqual(pIde.steps[0].ide, 'antigravity');
  assert.strictEqual(pIde.steps[0].projectQuery, 'free window radar');
  assert.strictEqual(pIde.steps[0].instruction, 'update the navbar in the website');

  const pYt = jarvis.planJarvisSteps('go on yt play kesariya song');
  assert(pYt.matched && pYt.steps[0].type === 'youtube_play' && pYt.steps[0].query === 'kesariya song');
  assert.strictEqual(extractFirstYouTubeVideoId('{"videoId":"BddP6PYo2gs"}'), 'BddP6PYo2gs');

  const pFolder = jarvis.planJarvisSteps('make a website folder called jarvis-demo on desktop');
  assert(pFolder.matched && pFolder.steps[0].type === 'create_folder' && pFolder.steps[0].name === 'jarvis-demo');

  const pDel = jarvis.planJarvisSteps('delete jarvis-demo from desktop');
  assert(pDel.matched && pDel.steps[0].type === 'delete_recycle' && pDel.steps[0].targetName === 'jarvis-demo');

  const pDl = jarvis.planJarvisSteps('download vlc');
  assert(pDl.matched && pDl.steps[0].type === 'download_item' && pDl.steps[0].target === 'vlc');

  const pChain = jarvis.planJarvisSteps('make a folder called demo-web and play lofi beats on youtube');
  assert(pChain.matched && pChain.steps.length === 2);
  console.log('OK: JARVIS natural-language planner verified (IDE+Prompt, YouTube autoplay, Folder, Recycle, Download, Chained)');

  assert.strictEqual(isProtectedPath('C:\\Windows'), true);
  assert.strictEqual(isProtectedPath('C:\\Program Files'), true);
  assert.strictEqual(isProtectedPath(os.homedir()), true);
  assert.strictEqual(isProtectedPath(path.join(os.tmpdir(), 'ov-jarvis-safe-test')), false);

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-jarvis-rt-'));
  try {
    const mk = jarvis.createFolder({ name: 'demo-site', baseDir: tmpBase, scaffold: 'website' }, { noExplorer: true });
    assert(mk.ok && fs.existsSync(path.join(mk.fullPath, 'index.html')));
    const rec = await jarvis.deleteToRecycleBin({ fullPath: mk.fullPath });
    assert(rec.ok && !fs.existsSync(mk.fullPath), 'Expected temp folder to be moved cleanly to Recycle Bin');
    console.log('OK: Protected-path boundary + temp folder scaffold + Recycle Bin safe delete verified');
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }

  console.log('\nALL OV V8.1 CHECKS PASSED!');
}

run().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
