# Security Policy — OV

## Supported versions

| Version | Security fixes |
|---|---|
| `8.x` | Active current release line (OV v8.1 JARVIS Voice OS & Robot OS) |
| `6.x` / `7.x` | Legacy lines — upgrade to `8.1.0` |
| Older versions | Not guaranteed |

**OV** is a local-first Windows desktop companion that observes sensitive local desktop context (notifications, clipboard snippets, active windows, local coding-agent activity, wireless radio state) and, when explicitly enabled by the user, exposes an authenticated paired mobile remote. Security reports are treated seriously.

## Reporting a vulnerability

**Do not report an exploitable vulnerability in a public GitHub issue.** Use GitHub's **Private vulnerability reporting** (`Security → Advisories → Report a vulnerability`) if enabled on the repository, or contact the maintainer privately through the contact method listed on their GitHub profile to request a private reporting channel.

Include, where possible:

- Affected commit/version, Windows/Android version, and configuration.
- Exact steps to reproduce, including expected vs actual behaviour.
- Realistic attack prerequisites and potential impact.
- Sanitised logs or proof-of-concept details with personal data, bearer tokens, PINs, IP addresses, and private file paths removed.

Never include live bearer tokens, pairing PINs, `.auth-token`, `mobile-auth.json`, signing keys, notification contents, clipboard contents, or personal Wi-Fi/device names in a report.

## Source-verified security controls in the current codebase

The following safeguards are implemented directly in the current OV repository (`src/`, `config/security.json`, `mobile/`) and regression-tested via `npm run verify`:

1. **Sandboxed Electron Renderers & Default Network Block** (`src/main/index.js`, `src/main/preload.js`)
   - All four `BrowserWindow` instances (`pet`, `hud`, `toast`, `picker`) enforce `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`.
   - Strict `Content-Security-Policy` (`default-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'`) plus `session.defaultSession.webRequest.onBeforeRequest` blocking outbound renderer requests (`outboundNetworkAllowed: false`).
   - Renderer navigation (`will-navigate`) and popups (`setWindowOpenHandler`) are denied.

2. **Loopback-Only Authenticated Agent Hook Server** (`src/services/hookServer.js`, `127.0.0.1:47821`)
   - Binds strictly to `127.0.0.1` (never `0.0.0.0`).
   - Validates `Host` (`127.0.0.1:47821` / `localhost:47821`) against DNS rebinding (`403`) and rejects requests carrying an `Origin` header (`403`) against browser CSRF.
   - Enforces a 256-bit `X-PetFish-Token` verified via `crypto.timingSafeEqual`, a `128 KB` body cap, and a `120 req/min` sliding-window rate limiter.

3. **Opt-In Mobile Remote Bridge & Hardened Android WebView** (`src/services/mobileRemote.js`, `:47822`, `MainActivity.java`)
   - **Disabled at startup**; LAN mode and Cloudflare Quick Tunnel (`*.trycloudflare.com`) start only when explicitly clicked by the user.
   - Protects state/action routes with a 256-bit Bearer token (`crypto.timingSafeEqual`), a one-time 6-digit pairing PIN (3-minute expiry, single-use), and a bounded per-IP brute-force lockout (5-minute ban after 5 failed attempts, capped at 500 tracked IPs).
   - Enforces an explicit CORS Origin allowlist (allowing the bundled Android APK `null` origin, active tunnel/custom URL, and local LAN while rejecting third-party websites with `403`), plus `Content-Security-Policy` and `Permissions-Policy` headers.
   - Android `MainActivity.java` disables `setAllowUniversalAccessFromFileURLs`, `setAllowFileAccessFromFileURLs`, `setAllowFileAccess`, `setAllowContentAccess`, and remote WebView debugging, denies camera/mic/geolocation prompts, and locks top-level navigation strictly to `file:///android_asset/index.html`.

4. **Command, SQL, Path-Deletion & Indirect Prompt Injection Defenses**
   - OS helpers (`systemControls.js`, `desktopAwareness.js`, `appLauncher.js`, `musicDetector.js`, `jarvisAgent.js`) invoke `execFile` / `spawn` argument arrays (never `exec` or `shell: true`), pass dynamic values to PowerShell via environment variables, and restrict URLs to `https://` or loopback `http://`.
   - JARVIS voice file/folder deletion (`jarvisAgent.js`) strictly enforces `isProtectedPath()` (blocking `C:\Windows`, `Program Files`, drive roots, and `%USERPROFILE%` root directories) and moves items safely to the **Windows Recycle Bin** instead of hard-deleting.
   - Windows notification reading (`notificationMonitor.js`) copies `wpndatabase.db` to a user-locked (`icacls`) private snapshot directory, runs static read-only `SELECT` queries, and deletes the snapshot in `finally`.
   - **Focus Lens** (`explain-clipboard` in `src/main/index.js`) enforces `allowActions: false` and `<untrusted_snippet>` isolation so untrusted copied text cannot trigger `[[ACTION:...]]` tool execution.

5. **Local Data & Secret Isolation**
   - Secrets and runtime state (`.auth-token`, `mobile-auth.json`, `.apk-keystore-pass`, `mobile-signing.jks`, `settings.json`, `autopilot.json`, `chat-history.json`) live **outside the Git repository** under `%LOCALAPPDATA%\PetFish\` (retained for backward-compatible upgrades) with user-only `icacls` permissions.
   - Clipboard Vault (`clipboardVault.js`) stores up to 16 recent snippets strictly in volatile RAM and never writes clipboard text to disk.
   - `logNotificationBodies: false` prevents private message bodies from being written to `logs/petfish.log`.

## User security guidance

1. **Keep Worldwide Tunnel OFF when not needed**, and click **Stop** when finished.
2. **Treat your Pairing Link, QR code, 6-digit PIN, and Bearer token like a master password.** Never share screenshots showing them.
3. **Rotate your mobile token immediately** (`Studio → Worldwide Mobile Remote → Rotate Key`) if a phone is lost or a pairing link is exposed.
4. **Review agent permission prompts carefully.** Auto-Pilot's safe/dangerous regex rules (`autoPilot.js`) are a convenience guardrail, not a sandbox or complete security boundary.
5. **Keep secrets and personal runtime files out of Git.** Always inspect `git status --short` and `git diff --cached` before committing or pushing.

## Scope and limitations

**OV has not undergone an independent third-party security audit.** Security depends on your local Windows user account, local network trust, installed developer tools, local LLM server configuration (`Ollama` / `LM Studio`), firewall settings, and how optional integrations are used. Detailed internal audit notes and fresher learning guides are available in [`security/README.md`](security/README.md).

---

## License

This security policy and the OV v8.0 codebase are distributed under the [MIT License](LICENSE) (`Copyright (c) 2026 OV contributors`). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for third-party disclosures.
