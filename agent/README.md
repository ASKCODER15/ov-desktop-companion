# Future-Agent Cold-Start Memory & Handover — OV (`agent/README.md`)

> **STOP & READ THIS FIRST IF YOU ARE A FUTURE AI AGENT STARTING A FRESH SESSION!**
> When context resets, you will have zero memory of how **OV** (formerly AURA / PetFish; repo folder `PetFish`) evolved from v1 to v6. This folder (`agent/`) is your persistent institutional memory so you can understand the entire project in under 60 seconds and avoid repeating solved bugs.

---

## Folder Map (Read In This Order)

| Priority | File | What You Learn |
| :---: | :--- | :--- |
| **1** | [README.md](./README.md) *(this file)* | Original motive, user taste/constraints, non-negotiable rules, and exact file reading order. |
| **2** | [ARCHITECTURE_AND_BUILD_LOG.md](./ARCHITECTURE_AND_BUILD_LOG.md) | Complete system map, how all 18 services + 4 Electron windows + Mobile APK fit together. |
| **3** | [DO_NOT_TOUCH.md](./DO_NOT_TOUCH.md) | Sacred files, fragile contracts, security invariants, and hard-won Windows/Electron/Android traps. |
| **4** | [OPERATIONS_AND_PLAYBOOK.md](./OPERATIONS_AND_PLAYBOOK.md) | Exact step-by-step checklists to add features, add a 5th companion, test, build APK, and launch live. |

Also read [../security/README.md](../security/README.md) before touching any HTTP endpoint, PowerShell call, renderer `innerHTML`, or Android WebView setting.

---

## 1. Original Motive & Product Vision (Why This Exists)

The owner is an **AI student, developer, and vibe coder on Windows** who wanted something far better than dull taskbar icons:
1. **A Cute Living Desktop Companion**: Four original OV companions — **Vesper** (Acrobat Companion), **Vector** (Aero-Mech Companion), **Core** (Holographic AI Companion), and **Coral** (Reef Companion) — with 20 original skins, custom nicknames, and elastic rubber-band drag squish!
2. **Real Daily Engineering Power (Zero Bloat)**:
   - See every running AI coding agent (`Antigravity`, `Claude Code`, `Cursor`, `Ollama`, `LM Studio`, etc.) with exact **`WHAT / HOW / WHY`** briefs and 1-click **Allow / Deny** tool approvals.
   - Instant local LLM brain (`Ollama qwen3.5:2b` default) with **`⚡ Fast` / `🧠 Think`** reasoning toggle, saved chat, **`A+S+D`** simultaneous wake chord, distinct offline character voices, **Wispr Flow** dictation, and **`✦ Focus Lens`** (explain copied code/errors).
   - Native Windows controls (Wi-Fi, Bluetooth, Flight Mode, Mute, Lock), Universal Launcher (189+ Start Apps + Brave browser + Web App Mode), Integrated Music Player + Theme BGM, RAM-only Clipboard Vault, and Smart Voice Reminders.
3. **Worldwide Mobile Control + Signed Android APK**:
   - Control AURA from anywhere in the world when the laptop is ON (Cloudflare Quick Tunnel + 256-bit Bearer auth + offline-queued two-way tasks), with a **real moving interactive HTML5 Canvas pet** inside a tiny **~60 KB signed Android APK**.
4. **Aesthetic & Performance Standard (CRITICAL!)**:
   - **Serene, minimal, mathematically aligned Apple VisionOS glass** (8px grid, crisp 1px hairlines, live Solid↔Liquid transparency slider). **NEVER make it look "funky", cluttered, or neon-clashed!**
   - **Ultra-low RAM (~160–190 MB)** and **ZERO external runtime npm dependencies** (`electron` is the only package in `package.json`).

---

## 2. Cold-Start Reading Order (Which Files to Open First!)

Do NOT blindly read all 54 files. Open files in this exact sequence depending on your task:

1. **Always start with**: `package.json` → `config/security.json` → `src/main/preload.js` (gives you every script, security invariant, and IPC contract in <200 lines!).
2. **Core Orchestrator**: `src/main/index.js` (owns window creation, physics loop, IPC handlers, tray, `A+S+D` chord, MobileRemote handlers, and `--verify-render`).
3. **If changing UI / Themes / Controls**: `src/renderer/styles.css` + `src/renderer/hud.html` + `src/renderer/hud.js` + `src/renderer/commands.js`.
4. **If changing Pets / Animations / Skins / Physics**: `src/services/petPhysics.js` + `src/renderer/fish-canvas.js` + `src/renderer/soundEngine.js`.
5. **If changing AI / Agents / System / Reminders / Clipboard**: Open ONLY the relevant service in `src/services/` (18 cleanly isolated modules — see `ARCHITECTURE_AND_BUILD_LOG.md`).
6. **If changing Mobile App / APK**: `mobile/web/index.html` + `src/services/mobileRemote.js` + `mobile/android/src/com/petfish/mobile/MainActivity.java` + `mobile/build-apk.ps1`.
7. **Always check before finishing**: `scripts/verify.js` (run `npm run verify` + visual render inspection!).

---

## 3. Non-Negotiable Rules For Future Agents

1. **Edit files in-place — NEVER create duplicate versioned files** (`hud-v2.js`, `styles-new.css`, etc.). Keep the repo spotless!
2. **NEVER push to GitHub or add a Git remote** unless the user explicitly asks you to push in that turn. Commit locally on `main` only.
3. **ZERO personal data leaks** in tracked files, docs, or `docs/posters/*.png` (never leak user's Windows username, real Wi-Fi SSIDs, Bluetooth device names, or personal WhatsApp messages).
4. **Use Brave Browser** (`appLauncher.js` — this machine uses Brave, NOT Chrome).
5. **Keep runtime dependencies at ZERO** (do not bloat `package.json` with heavy frameworks/libraries; pure Node.js built-ins + HTML5 Canvas + Web Audio keeps RAM around ~162 MB idle).
6. **Always visually verify UI changes** by running `electron . --verify-render` and inspecting the generated PNGs before claiming a UI edit is complete!
7. **Always launch the live desktop app via `Start-Process explorer.exe -ArgumentList '"<Desktop>\AURA.lnk"'`** so Windows Explorer owns the process (otherwise PowerShell's Job Object kills Electron the instant your command exits!).
