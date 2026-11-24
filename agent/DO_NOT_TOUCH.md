# Sacred Files, Invariants & Hard-Won Gotchas (`agent/DO_NOT_TOUCH.md`)

> **READ THIS BEFORE EDITING ANYTHING!**
> Every single item below either protects a security boundary, preserves backward compatibility, or prevents a subtle Windows / Electron / Android bug that already cost debugging time to solve.

---

## 1. DO NOT Rename or Break These Paths & Contracts

| Sacred Contract | Why You MUST NOT Change It |
| :--- | :--- |
| **Directory `PetFish` & `%LOCALAPPDATA%\PetFish\`** | Even though the brand is **AURA**, keeping `privateDataDirName: "PetFish"` preserves the user's existing Git repo, Claude Code hooks (`scripts/claude-hook.js`), `.auth-token`, `settings.json`, `chat-history.json`, and `mobile-signing.jks` without breaking upgrades! |
| **Hook Port `127.0.0.1:47821` & Mobile Port `47822`** | `scripts/claude-hook.js` and `mobile/web/index.html` expect these exact ports. Never bind `47821` to `0.0.0.0`. |
| **`config/security.json` Defaults** | NEVER set `outboundNetworkAllowed: true`, `requireAuthToken: false`, `rejectCrossOrigin: false`, or `logNotificationBodies: true` in committed config! |
| **Electron `webPreferences` in ALL 4 Windows (`src/main/index.js`)** | NEVER weaken `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, or `allowRunningInsecureContent: false`. |
| **`allowActions: false` in `petfish:explain-clipboard`** | Blocks Indirect Prompt Injection (OWASP LLM01) when explaining untrusted copied text. NEVER change to `true`! |
| **Android `MainActivity.java` WebView Lockdown** | NEVER re-enable `setAllowUniversalAccessFromFileURLs(true)`, `setAllowFileAccessFromFileURLs(true)`, `setAllowFileAccess(true)`, `setWebContentsDebuggingEnabled(true)`, or remove `shouldOverrideUrlLoading`! |
| **Zero Hardcoded Passwords in `mobile/build-apk.ps1`** | Always read the signing password from `$env:AURA_KEYSTORE_PASS` or `%LOCALAPPDATA%\PetFish\.apk-keystore-pass` via `env:AURA_KS_PASS`. |
| **Privacy Sanitization in `getFullState()` (`IS_VERIFY_RENDER`)** | NEVER remove the `if (IS_VERIFY_RENDER)` sanitized demo snapshot in `src/main/index.js` — otherwise running `--verify-render` will leak real Wi-Fi SSIDs, Bluetooth names, and private messages into `docs/posters/*.png`! |
| **Keep `mobile/web/index.html` Single-File & Zero-CDN** | It is bundled offline inside the Android APK (`assets/index.html`) AND served directly by `mobileRemote.js`. External `<script src="https://...">` CDN links will break offline mode AND violate the CSP! |

---

## 2. Hard-Won Windows, PowerShell & Electron Gotchas

### Gotcha A: Never Launch the Live App Directly from PowerShell!
- **Problem**: If you start `electron.exe` directly inside a tool command, Windows PowerShell's Job Object **kills Electron the moment your terminal session finishes**.
- **Correct Pattern**:
  ```powershell
  Start-Process explorer.exe -ArgumentList "`"$env:USERPROFILE\Desktop\AURA.lnk`""
  ```
  Windows Explorer detaches and owns the process permanently.

### Gotcha B: Electron `--verify-render` Is a Windows GUI Subsystem Binary
- **Problem**: Running `.\node_modules\electron\dist\electron.exe . --verify-render` directly in PowerShell returns immediately before Electron finishes rendering!
- **Correct Pattern**: Always launch with `Start-Process ... -PassThru` and `$p.WaitForExit(15000)` (or `-Wait` after ensuring no child processes remain open). Also **always stop any existing `electron` process BEFORE running `npm run verify`** — otherwise port `47822` is busy (`EADDRINUSE`) and the MobileRemote PIN test hits the live server instead of the test server!

### Gotcha C: PowerShell 5.1 ZipArchive Assembly in `mobile/build-apk.ps1`
- **Problem**: PowerShell 5.1 throws `Unable to find type [System.IO.Compression.ZipArchiveMode]` if you only load `System.IO.Compression.FileSystem`.
- **Keep Both Lines**:
  ```powershell
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  ```

### Gotcha D: `getLocalLanIp()` Must Skip Virtual WSL/Docker/Hyper-V Adapters
- **Problem**: On Windows laptops with WSL2/Docker, `os.networkInterfaces()` often returns `172.x.x.x` (vEthernet WSL) before real Wi-Fi `192.168.x.x`.
- **Invariant**: Keep the virtual-interface regex and `192.168.*` priority sort in `src/services/mobileRemote.js`.

### Gotcha E: Small Local LLMs Emit Both `[ACTION:{...}]` and `[[ACTION:{...}]]`
- **Problem**: `qwen3.5:2b` occasionally drops one bracket when emitting structured tool actions.
- **Invariant**: Keep the tolerant regex `/\[{1,2}\s*ACTION\s*:\s*(\{[\s\S]*?\})\s*\]{1,2}/i` in `src/services/llmBrain.js` AND keep `think: false` in Fast Mode so Ollama doesn't stall with hidden reasoning tokens.

### Gotcha F: `hudWindow` / `toastWindow` RAM Optimization
- **Invariant**: Keep `hudWindow` and `toastWindow` destroyed on close (`hudWindow.destroy()`) rather than merely hidden (`hide()`). Keeping hidden Chromium renderers alive wastes ~80–120 MB RAM!

### Gotcha G: Passing Dynamic Strings to PowerShell
- **Rule**: **NEVER** write `` `... ${userInput} ...` `` inside a PowerShell script template! ALWAYS pass dynamic strings via `env: { ...process.env, PETFISH_VAR: safeVal }` and read `$env:PETFISH_VAR` inside PowerShell.

### Gotcha H: `safeColor()` Before Every SVG / Inline `style` Interpolation
- **Rule**: Whenever rendering dynamic colors in `hud.js` or `mobile/web/index.html`, always wrap with `safeColor(val, fallback)` (`/^#[0-9a-fA-F]{3,8}$/`) and wrap all text/attributes with `escapeHtml()` / `esc()`.

### Gotcha I: Avoid Anonymous Inner Classes (`$1.class`) in Android `MainActivity.java`
- **Problem**: Android BuildTools 34 `d8` with JDK 21 `--release 11` throws an NPE on anonymous inner-class bytecode (`MainActivity$1.class`).
- **Rule**: Define helper clients (`AuraWebViewClient`, `AuraWebChromeClient`) as top-level package-private classes so `.class` filenames never contain `$`.
