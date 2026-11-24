# OV Security Audit & Defense Handbook (`security/`)

> **Audience**: Built both as an authoritative **Security Audit Record** for engineers/reviewers AND as a clear, real-world **Application Security (AppSec) Learning Guide** for fresher developers and college students.

---

## Folder Contents

| File | Purpose |
| :--- | :--- |
| [README.md](./README.md) | Executive security audit scorecard across every OWASP Web, Mobile, Electron, and LLM attack surface. |
| [RISKS_AND_FIXES.md](./RISKS_AND_FIXES.md) | Deep-dive breakdown of every real risk discovered during the code audit, why it was dangerous, and the exact fix applied in code. |
| [FRESHER_SECURITY_GUIDE.md](./FRESHER_SECURITY_GUIDE.md) | Plain-English fresher/student crash course on SQL Injection, Command Injection, Prompt Injection, XSS, CSRF, CORS, Secrets, and a 10-point Pre-Commit Checklist. |

---

## Full Codebase Security Audit Scorecard

Every file in `src/`, `scripts/`, `config/`, and `mobile/` was audited line-by-line against OWASP Top 10 (Web), OWASP Mobile Top 10, OWASP Top 10 for LLM Applications, and Electron Security Guidelines.

| Security Domain | Audit Verdict | Severity (Pre-Fix) | Key Files Audited / Hardened |
| :--- | :---: | :---: | :--- |
| **1. API Keys & Secret Leaks** | **PASS (0 External Keys) / FIXED** | Medium | Removed hardcoded APK keystore password in `mobile/build-apk.ps1` → replaced with per-user random secret locked via `icacls` outside Git. Zero external API keys found anywhere. |
| **2. SQL Injection (SQLi)** | **VERIFIED SAFE + HARDENED** | Low (Defense-in-Depth) | `src/services/notificationMonitor.js` uses strictly static read-only `SELECT` queries on a temp copy of `wpndatabase.db` (zero string concatenation). Added user-only `icacls` lock on snapshot dir. |
| **3. AI Indirect Prompt Injection (OWASP LLM01)** | **FIXED** | High | `src/main/index.js` (`explain-clipboard` / `✦ Focus Lens`) previously allowed `[[ACTION:...]]` tool execution on untrusted clipboard text. Fixed with `allowActions: false`, tag redaction, and `<untrusted_snippet>` isolation. |
| **4. Android WebView File & Navigation Abuse (OWASP Mobile M8/M1)** | **FIXED** | High | `mobile/android/.../MainActivity.java` previously enabled `setAllowUniversalAccessFromFileURLs(true)` and unrestricted navigation. Disabled all unsafe file/universal/content/debug flags and restricted navigation strictly to `file:///android_asset/index.html`. |
| **5. XSS, SVG & CSS Attribute Injection** | **FIXED** | Medium-High | `src/renderer/hud.js` and `mobile/web/index.html` previously interpolated agent `accent` colors directly into SVG/style attributes. Added strict hex regex `safeColor()` + full HTML escaping (`escapeHtml` including `'`). |
| **6. Mobile Bridge CORS, CSP & Rate-Limit DoS** | **FIXED** | Medium | `src/services/mobileRemote.js` previously sent wildcard `Access-Control-Allow-Origin: *` and lacked a `Content-Security-Policy` header on HTML. Replaced with strict Origin allowlist (blocking arbitrary third-party sites with `403`), full CSP + `Permissions-Policy`, bounded `failMap` (500-entry cap), 5-try lockout, and payload string bounds. |
| **7. Command & Argument Injection (PowerShell / `netsh` / `explorer`)** | **VERIFIED SAFE + HARDENED** | Medium | `desktopAwareness.js`, `systemControls.js`, `appLauncher.js`, `musicDetector.js` use `execFile`/`spawn` (no shell) and pass dynamic values via environment variables (never interpolated into PowerShell!). Hardened Wi-Fi SSID & Windows `appId` character allowlists further. |
| **8. Electron Window Sandbox & Outbound Network Blocking** | **HARDENED** | Medium | All 4 BrowserWindows enforce `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, strict CSP (`connect-src 'none'`), and session-level outbound request blocking. |
| **9. Local Hook Server Auth, CSRF & DNS Rebinding** | **VERIFIED STRONG** | High (Mitigated) | `src/services/hookServer.js` binds strictly to `127.0.0.1:47821`, enforces constant-time 256-bit token verification (`crypto.timingSafeEqual`), rejects any `Origin` header (`403`), rejects spoofed `Host` headers (`403`), caps body at `128 KB`, and rate-limits at `120 req/min`. |
| **10. Personal Data & Privacy Leakage** | **VERIFIED ZERO LEAKS** | High (Mitigated) | Secrets live outside Git (`%LOCALAPPDATA%\PetFish\`); Clipboard Vault is RAM-only; notification bodies are never logged; `docs/posters/` uses privacy-sanitized demo data during `--verify-render`. |

---

## Automated Security Regression Tests

Run the built-in security verification suite anytime after modifying code:

```powershell
npm run verify
```

It automatically asserts:
1. 256-bit token stored privately outside the Git repository.
2. Unauthenticated `POST /api/notify` → `401 Unauthorized`.
3. Cross-origin `Origin: https://evil.example` on HookServer → `403 Forbidden`.
4. Spoofed `Host: evil.attacker:47839` (DNS rebinding) → `403 Forbidden`.
5. Auto-Pilot safe `Read` → `allow`, destructive `Bash rm -rf /` → `deny`.
6. Unsafe URL schemes (`javascript:alert(1)`) → blocked (`null`).
7. MobileRemote unauthenticated `/api/mobile/state` → `401 Unauthorized`.
8. MobileRemote cross-origin `Origin: https://evil.example` → `403 Forbidden`, while Android APK WebView (`Origin: null`) → `200 OK`.
9. One-time 6-digit PIN → 256-bit Bearer token exchange and authenticated task sync.
