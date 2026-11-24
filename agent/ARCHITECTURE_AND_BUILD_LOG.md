# AURA Architecture & How It Was Built (`agent/ARCHITECTURE_AND_BUILD_LOG.md`)

> Technical blueprint explaining how every piece of AURA v6.0 was designed, how data flows across processes, and which folders matter most.

---

## 1. High-Importance Folder Guide

| Folder | Importance | What Lives Here |
| :--- | :---: | :--- |
| **`src/main/`** | **CRITICAL** | Electron main process (`index.js`) & sandboxed IPC bridge (`preload.js`). The central nervous system. |
| **`src/services/`** | **CRITICAL** | 18 independent Node.js backend engines (physics, AI brain, agents, notifications, Wi-Fi/BT, music, reminders, clipboard, mobile server, security). |
| **`src/renderer/`** | **CRITICAL** | 4 transparent Chromium windows: Pet Canvas (`fish-canvas.js`), Sound/TTS (`soundEngine.js`), Minimal Glass HUD (`hud.html`/`hud.js`/`styles.css`/`commands.js`), Toast, Picker. |
| **`mobile/`** | **HIGH** | Self-contained offline-first Mobile Web App + Moving Canvas Pet (`mobile/web/index.html`), hardened native Android WebView (`mobile/android/`), and zero-Gradle APK compiler (`build-apk.ps1`). |
| **`scripts/`** | **HIGH** | Automated regression & security test suite (`verify.js`), Claude Code hook bridge (`claude-hook.js`), Desktop shortcut creator (`create-shortcut.ps1`). |
| **`config/`** | **SACRED** | Default security policy (`security.json`) — loopback host, port `47821`, token enforcement, outbound network block. |
| **`docs/posters/`** | **PUBLIC** | 8 privacy-sanitized PNG showcase screenshots embedded in `README.md`. Auto-regenerated during `electron . --verify-render`. |
| **`security/`** | **REFERENCE** | Full security audit scorecard, vulnerability patches, and student AppSec guide. |
| **`agent/`** | **MEMORY** | This persistent agent handover & onboarding folder. |
| **`%LOCALAPPDATA%\PetFish\`** *(OUTSIDE Git!)* | **PRIVATE RUNTIME** | `.auth-token`, `mobile-auth.json`, `mobile-signing.jks`, `.apk-keystore-pass`, `settings.json`, `autopilot.json`, `chat-history.json`, `tmp-wpn/`. Never tracked in Git! |

---

## 2. Boot Lifecycle (`src/main/index.js`)

1. **Single-Instance Lock (`app.requestSingleInstanceLock()`)**: Second launches surface the existing pet and open the Mini Popover instead of spawning duplicate processes.
2. **Settings & Security**: `loadSettings()` reads `%LOCALAPPDATA%\PetFish\settings.json` through `sanitizeSettingsPatch()`; `applySecurityPolicies()` blocks all non-`file://` / `data:` renderer requests at the Electron session layer.
3. **Physics & Windows**: Initializes `PetPhysics` against primary display `workArea`, wires IPC (`wireIpc()`) and event listeners (`wireMonitors()`), then creates the always-on-top transparent `petWindow` (`204 × 196`).
   - Other windows (`hudWindow`, `toastWindow`, `pickerWindow`) are created **lazily on demand and destroyed on close** — that single architectural choice cut idle RAM by **74%**!
4. **Live Background Services (Skipped in `--verify-render` mode)**:
   - `createTray()` — system tray icon + quick menu.
   - `hookServer.start()` — `127.0.0.1:47821` authenticated local agent hook server.
   - `notificationMonitor.start()` — watches Windows `Notifications` dir + read-only SQLite snapshot of `wpndatabase.db`.
   - `agentMonitor.start()` — tracks processes, Ollama `/api/ps`, Antigravity transcripts, and Claude Code hooks.
   - `discoveryEngine.start()` — `fs.watch` on Downloads/Desktop/Start Menu/AppData for zero-delay new tool detection.
   - `musicDetector.start()` — lightweight 5.5s Windows SMTC poll (exits after each poll so 0 MB stays resident).
   - `clipboardVault.start()` — 1.8s RAM-only clipboard watcher (last 16 snippets).
   - `startAsdChordWatcher()` — low-CPU Win32 `GetAsyncKeyState(0x41/0x53/0x44)` watcher (~85ms hold, 1.5s cooldown) that opens saved Chat + greets aloud.
   - `startPhysicsLoop()` — adaptive tick (`32 ms` active / `65 ms` idle stay / `250 ms` hidden); calls `petWindow.setBounds()` ONLY when `x`/`y` actually change!

---

## 3. Complete 18-Service Map (`src/services/`)

| Service | Lines | Responsibility |
| :--- | :---: | :--- |
| `agentMonitor.js` | 668 | Detects active/idle coding agents & compiles `WHAT / HOW / WHY` telemetry briefs. |
| `appLauncher.js` | 586 | Universal launcher: curated core apps (`Brave`, `CMD`, `PowerShell`, `Wispr`, character OSTs), 189+ indexed Windows Start Apps (`Get-StartApps`), and Brave Web App mode (`--app=<url>`). |
| `systemControls.js` | 509 | Native Windows WinRT Radio toggle (Wi-Fi/BT/Flight), `netsh wlan` profile switcher, `BluetoothAPIs.dll` audio connect, mute, and `LockWorkStation`. |
| `mobileRemote.js` | 450 | Opt-in HTTP server (`:47822`) + `cloudflared` HTTPS Quick Tunnel, Origin-validated CORS, CSP headers, 256-bit Bearer token, 6-digit PIN, 5-try lockout. |
| `notificationMonitor.js` | 345 | Copies `wpndatabase.db` to user-locked private temp dir, reads via `node:sqlite` (or Python fallback), parses toast XML, deletes snapshot in `finally`. |
| `hookServer.js` | 316 | Loopback `127.0.0.1:47821` HTTP server with `Host`/`Origin`/token/rate-limit guards + 120s long-polling for Claude Code `PermissionRequest`. |
| `petPhysics.js` | 308 | 4-character kinematics (Vesper tether arcs, Vector jet cruise, Core zero-G orbit, Coral swim) + damped spring elastic drag squish (`applyDragPull` / `releaseDragSpring`). |
| `llmBrain.js` | 302 | Discovers Ollama (`:11434`) & LM Studio (`:1234`), prefers `qwen3.5:2b`, saves chat to `chat-history.json`, parses `<think>` + `res.message.thinking`, parses `[ACTION:{...}]` / `[[ACTION:{...}]]`. |
| `autoPilot.js` | 282 | Safe/dangerous permission evaluator, two-way To-Do tasks, Smart Voice Reminders (3s tick, mirrors to Tasks), Sprint timer, Focus Streak & XP leveling. |
| `desktopAwareness.js` | 234 | Persistent foreground window class watcher (for Desktop-Only mode), injection-safe `focusAppWindow` (via env vars), and `A+S+D` chord watcher. |
| `qrCode.js` | 232 | 100% offline zero-dependency Reed-Solomon QR matrix & SVG generator. |
| `security.js` | 182 | `config/security.json` loader, private data dir, `icacls` user locking, 256-bit token generator, `timingSafeEqual`, sliding rate limiter, IPC sanitizers, 256 KB rotating logger. |
| `iconGenerator.js` | 176 | Programmatic pure-Node PNG & multi-size `.ico` generator (also builds Android `ic_launcher.png`). |
| `discoveryEngine.js` | 171 | Zero-delay directory watchers for newly installed apps & AI coding tools. |
| `musicDetector.js` | 146 | Windows SMTC Now-Playing reader + Win32 `keybd_event` media keys (`prev`/`playPause`/`next`). |
| `systemPulse.js` | 132 | Captures open desktop windows, listening localhost dev ports, and Electron private RAM. |
| `clipboardVault.js` | 103 | Privacy-first RAM-only 16-snippet clipboard vault (copy, pin, delete, clear). |
| `claudeHookManager.js` | 88 | Non-destructive installer/uninstaller for `~/.claude/settings.json` hooks. |

---

## 4. How the Mobile APK Pipeline Works (Zero Gradle!)

`mobile/build-apk.ps1` compiles a production-grade signed Android APK in **~6 seconds** using ONLY the official Android SDK (`platforms;android-34` + `build-tools;34.0.0` at `%LOCALAPPDATA%\Android\Sdk`) and JDK 21 (`temurin21-jdk`):
1. Copies `mobile/web/index.html` into `mobile/android/assets/index.html`.
2. Generates `192 × 192` `ic_launcher.png` from `src/services/iconGenerator.js`.
3. `aapt2 compile` + `aapt2 link` → packages manifest, resources, assets, and generates `R.java`.
4. `javac --release 11` → compiles `MainActivity.java` + `R.java`.
5. `d8 --min-api 24` → produces `classes.dex` and injects it into the APK zip.
6. `zipalign -f -p 4` → 4-byte aligns uncompressed assets.
7. `apksigner sign` + `apksigner verify` → v2-signs with user-locked RSA-2048 keystore in `%LOCALAPPDATA%\PetFish\mobile-signing.jks` using random secret in `.apk-keystore-pass` (passed via `env:AURA_KS_PASS`).
8. Output: `mobile/PetFish-Mobile.apk` (~60.5 KB, gitignored), copied to Desktop as `AURA-Mobile.apk`.
