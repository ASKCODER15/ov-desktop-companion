# Agent Operations & Engineering Playbook (`agent/OPERATIONS_AND_PLAYBOOK.md`)

> Concrete step-by-step recipes for future agents modifying, testing, verifying, building, and releasing **AURA**.

---

## 1. Exact Checklist: Adding a 5th Companion Character

If the user asks to add another companion (e.g., *Batman*, *Pikachu*, *Wall-E*), touch these **10 files in-place** in exact order:
1. `src/services/security.js` — Add character key to `VALID_PET_CHARS`.
2. `src/services/petPhysics.js` — Add character key to `setCharacter()` and custom movement behavior in `step(dt)`.
3. `src/renderer/soundEngine.js` — Add distinct voice profile in `VOICE_PROFILES` + synthesized motif in `playCharacterMotif()`.
4. `src/renderer/fish-canvas.js` — Add skin palette (`<CHAR>_SKINS`) + procedural canvas renderer (`draw<Char>()`) with elastic squish support.
5. `src/services/appLauncher.js` — Add `bgm-<char>` OST launcher URL in `ALLOWLISTED_APPS`.
6. `src/services/llmBrain.js` — Add persona line in `buildSystemPrompt()`.
7. `src/renderer/commands.js` — Add instant switch phrase matcher (`action: 'character'`).
8. `src/renderer/styles.css` + `hud.html` + `hud.js` — Add minimal character-synced `body[data-theme="<char>"]` variables, `SKIN_CATALOG`, Mini switcher button, Studio card, and `renderAgentMascotSvg()`.
9. `src/main/index.js` — Add to `setPetCharacter`, tray menu, `mobileRemote.controlPet`, and `runRenderSelfTest()`.
10. `mobile/web/index.html` — Add theme CSS, `SKIN_PALETTES`, canvas drawer `drawMobile<Char>()`, and switcher button, then run `npm run build:apk`.

---

## 2. Exact Checklist: Adding a New IPC Channel or Mobile Endpoint Safely

1. **Validate inputs at the trust boundary** (`src/services/security.js` or inside the handler): enforce type, length caps, allowlists, and reject shell/control characters.
2. **Expose narrow method in `src/main/preload.js`** via `contextBridge` (never expose raw `ipcRenderer`).
3. **Register handler in `src/main/index.js`** (`wireIpc()` and/or `mobileRemote` handlers).
4. **If adding a Mobile route (`src/services/mobileRemote.js`)**:
   - Place it **AFTER** `this.isAuthorized(req)` (256-bit Bearer token gate).
   - Always pass `corsOrigin` to `this.sendJson(res, status, obj, corsOrigin)`.
   - Never expose raw OS paths, tokens, or unmasked private notifications.
5. **Add an assertion in `scripts/verify.js`** proving both happy path AND unauthorized/malicious input rejection!

---

## 3. Standard Verification & Release Pipeline (Run Before Reporting Done!)

```powershell
cd <REPO_ROOT>

# 1. Syntax-check every JS file
Get-ChildItem src, scripts -Recurse -Filter "*.js" | ForEach-Object {
  node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Syntax error: $($_.FullName)" }
}

# 2. Stop live Electron cleanly so port 47822 is free for verify.js
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

# 3. Run full 8-stage backend, security, LLM, physics, clipboard & mobile verification
npm run verify

# 4. Run headless visual render self-test & regenerate privacy-sanitized docs/posters/*.png
$p = Start-Process -FilePath ".\node_modules\electron\dist\electron.exe" -ArgumentList ". --verify-render" -PassThru
$p.WaitForExit(18000) | Out-Null
Get-Content .\logs\verify-render.json
# -> IMPORTANT: Visually inspect generated PNGs with read_file to verify zero overlaps & zero leaks!

# 5. If mobile/web/index.html or mobile/android/ changed, rebuild & v2-sign APK
npm run build:apk
Copy-Item .\mobile\PetFish-Mobile.apk "$env:USERPROFILE\Desktop\AURA-Mobile.apk" -Force

# 6. Clean temp build/log artifacts & run Zero Privacy Leak Audit
Remove-Item .\logs\* -Force -ErrorAction SilentlyContinue
Remove-Item .\mobile\android\build -Recurse -Force -ErrorAction SilentlyContinue
git status --short
git remote -v   # Confirm empty unless user explicitly asked to push!

# 7. Commit cleanly on local main (NO git push unless user explicitly asks!)
git add -A
git commit -m "feat(...): concise summary"

# 8. Refresh Desktop shortcut & launch AURA live via Explorer (persists cleanly!)
npm run shortcut
Start-Process explorer.exe -ArgumentList "`"$env:USERPROFILE\Desktop\AURA.lnk`""
Start-Sleep -Seconds 3
Invoke-RestMethod -Uri "http://127.0.0.1:47821/api/health" -TimeoutSec 4
```

---

## 4. Fast Troubleshooting Runbook

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| `npm run verify` fails at section 8 with `401 !== 200` on `MOBILE_PORT` | Live AURA Electron app is still running and bound to `47822`. | Stop `electron` processes first, then re-run `npm run verify`. |
| Electron dies immediately after launching from shell | PowerShell Job Object terminates child GUI apps on shell exit. | Launch via `Start-Process explorer.exe -ArgumentList '"...\Desktop\AURA.lnk"'`. |
| Local AI replies say "Start Ollama" | Ollama daemon isn't running on `127.0.0.1:11434`. | Run `ollama serve` or launch Ollama Desktop; click Refresh in HUD. |
| Mobile APK shows "Laptop Offline" | Laptop is asleep/off, or Worldwide Cloudflare Tunnel wasn't started. | Open Desktop AURA → Deep Dive → Studio → **Go Worldwide (HTTPS)**. |
| `build-apk.ps1` fails on `keytool` / `javac` / `aapt2` | JDK or Android SDK 34 not on PATH / `$env:LOCALAPPDATA\Android\Sdk`. | Verify `java -version` (JDK 17–21) and `$env:LOCALAPPDATA\Android\Sdk\build-tools\34.0.0`. |
| `docs/posters/*.png` shows real Wi-Fi name | Poster was captured without `--verify-render` flag. | Always capture public posters exclusively through `--verify-render` (which activates sanitized demo mode). |
