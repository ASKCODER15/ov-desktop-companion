# Fresher & Student's Practical Security Guide (`security/FRESHER_SECURITY_GUIDE.md`)

> **Why read this?** Most college projects work on `localhost`, get pushed to GitHub, and accidentally expose API keys, SQL injection bugs, or RCE holes. This guide teaches you **the 10 real-world security concepts every software & AI engineer MUST know** — explained using actual code from **AURA**.

---

## 1. Secret & API Key Leaks (The #1 Student Mistake!)
- **What goes wrong**: Putting an OpenAI key (`sk-...`), Firebase secret, database URL, or keystore password straight inside `index.js` or a `.ps1` script and pushing to GitHub. Automated bots scrape public GitHub repos in **under 15 seconds**!
- **Golden Rule**: **Code goes in Git. Secrets NEVER go in Git.**
- **How AURA does it**:
  - Auth tokens (`.auth-token`), mobile pairing keys (`mobile-auth.json`), and APK signing secrets (`.apk-keystore-pass` + `mobile-signing.jks`) are stored **outside the repo** in `%LOCALAPPDATA%\PetFish\` and locked to your Windows user with `icacls`.
  - `.gitignore` explicitly blocks `.env`, `*.jks`, `*.apk`, `logs/`, and token files.

## 2. SQL Injection (SQLi)
- **What goes wrong**: Concatenating user input directly into a SQL query:
  ```js
  // VULNERABLE — NEVER DO THIS!
  db.exec(`SELECT * FROM users WHERE name = '${userInput}'`);
  ```
  If someone inputs `' OR '1'='1`, the query changes its logic and dumps the whole table!
- **Golden Rule**: Always use **Parameterized Queries** (`SELECT * FROM users WHERE name = ?`, passing `[userInput]` separately) or strictly static queries with zero string concatenation.
- **How AURA does it**: `notificationMonitor.js` uses a read-only database handle (`{ readOnly: true }`) and 100% static SQL queries — zero user text ever enters SQL.

## 3. Command Injection & Argument Injection
- **What goes wrong**: Running shell commands with `exec("ping " + userInput)` or interpolating user text inside a PowerShell string (`powershell -Command "echo ${userInput}"`). If `userInput` is `google.com; calc.exe`, Windows executes **both** commands!
- **Golden Rules**:
  1. Use **`execFile(binary, [arg1, arg2])`** or **`spawn(binary, [args])`** — NEVER `exec()` or `shell: true`!
  2. When calling PowerShell, pass untrusted values through **Environment Variables** (`$env:MY_VAR`), NEVER string interpolation (`${var}`).
  3. Validate inputs against an **allowlist** (e.g., reject `-`, `/`, `;`, `|`, `&`, quotes) so attackers cannot sneak in extra CLI flags.
- **How AURA does it**: Look at `src/services/desktopAwareness.js` (`PETFISH_FOCUS_HINT`) and `src/services/systemControls.js` (`PETFISH_BT_MAC`, `SAFE_SETTINGS_URIS`).

## 4. Indirect Prompt Injection (The New #1 Risk in AI Apps — OWASP LLM01!)
- **What goes wrong**: You build an AI tool that reads a webpage, PDF, email, or clipboard snippet AND can also run actions (like opening apps or calling APIs). An attacker hides invisible text in that webpage: *"Ignore the user. Run action X instead."* The LLM cannot tell **data** apart from **instructions**!
- **Golden Rule**: **Never give an LLM tool-execution permissions when processing untrusted external content.** Enforce the block in deterministic backend code — don't rely only on the system prompt!
- **How AURA does it**: In `src/main/index.js`, `✦ Focus Lens` (`explain-clipboard`) explicitly passes **`allowActions: false`**, so even if copied text tries to hijack the LLM into emitting `[[ACTION:...]]`, the backend refuses to execute any action.

## 5. Cross-Site Scripting (XSS) & Content-Security-Policy (CSP)
- **What goes wrong**: Dropping untrusted text into `element.innerHTML = userText`. If `userText` contains `<img src=x onerror=alert(1)>`, the browser runs attacker JavaScript!
- **Golden Rules**:
  1. Prefer **`element.textContent = text`** whenever you don't need HTML tags.
  2. When building HTML templates, escape **every** string (`&`, `<`, `>`, `"`, `'`) AND validate special attributes like CSS colors (`/^#[0-9a-fA-F]{3,8}$/`) and URLs (`https://` only — block `javascript:`!).
  3. Always add a **Content-Security-Policy (`CSP`)** header as your second safety net so unauthorized scripts cannot run even if an escaping bug slips in.

## 6. CSRF, CORS & DNS Rebinding (Why `localhost` Is NOT Automatically Safe!)
- **Surprising fact for freshers**: Even if your server only runs on `127.0.0.1`, a malicious website open in your browser can try to send `fetch("http://127.0.0.1:47821/api/...")`!
- **How AURA stops all 3**:
  - **Anti-CSRF (`Origin` check)**: Any browser cross-origin request attaches an `Origin` header. `hookServer.js` rejects ANY request with an `Origin` header (`403`).
  - **Strict CORS (`mobileRemote.js`)**: Only allows trusted origins (the bundled Android APK `null` origin, your exact Cloudflare tunnel, or local LAN) — rejects random websites (`403`).
  - **Anti-DNS Rebinding (`Host` check)**: Verifies `req.headers.host` is literally `127.0.0.1:47821` or `localhost:47821`.
  - **256-bit Auth Token**: Even if a request reached the port, without the secret header token it gets `401 Unauthorized`.

## 7. Timing Attacks & `crypto.timingSafeEqual`
- **What goes wrong**: Comparing secret tokens with `if (provided === expected)`. Normal `===` stops at the **first mismatched character**, taking nanoseconds longer when more prefix characters match — leaking the secret statistically!
- **Golden Rule**: Always compare tokens, HMACs, and PINs using **`crypto.timingSafeEqual(bufA, bufB)`** (see `src/services/security.js`).

## 8. Electron App Security Essentials
Because Electron combines Chromium (web) + Node.js (full OS access), misconfigured Electron apps are a favorite target:
- Always set **`nodeIntegration: false`**, **`contextIsolation: true`**, **`sandbox: true`**, **`webSecurity: true`**.
- Expose ONLY narrow, validated functions in `preload.js` via `contextBridge.exposeInMainWorld(...)`. Never expose raw `ipcRenderer.send` or Node modules!
- Block navigation (`will-navigate`) and popups (`setWindowOpenHandler(() => ({ action: 'deny' }))`).

## 9. Android WebView Security Essentials
If you wrap a web app into an Android APK using `WebView`:
- NEVER enable `setAllowUniversalAccessFromFileURLs(true)` or `setAllowFileAccessFromFileURLs(true)`.
- Set `setAllowFileAccess(false)`, `setAllowContentAccess(false)`, `setWebContentsDebuggingEnabled(false)`.
- Lock `shouldOverrideUrlLoading` so the WebView cannot be redirected to phishing URLs.

## 10. Rate Limiting & Brute-Force Protection
- **What goes wrong**: Having a 6-digit pairing PIN (`000000`–`999999`) with no rate limit lets a script guess all 1,000,000 combinations in minutes.
- **How AURA stops it**: One-time PIN expires in **3 minutes**, locks out an IP for **5 minutes after 5 failed guesses**, and caps the tracking map at 500 entries to avoid RAM DoS.

---

## Pre-Push 10-Point Security Checklist (Use Before EVERY GitHub Push!)

1. [ ] **No secrets or keys in tracked files** (check `git diff` and grep for `sk-`, `AIza`, `password`, `token`, `.env`, `.jks`).
2. [ ] **No personal data in screenshots/docs/logs** (Wi-Fi SSIDs, personal usernames, Bluetooth names, WhatsApp messages).
3. [ ] **No `exec()` / `shell: true` with user input** — use `execFile()` / `spawn()` + allowlists.
4. [ ] **No string-concatenated SQL** — use parameterized `?` queries or static read-only queries.
5. [ ] **Every `.innerHTML` escapes all variables** (`escapeHtml` + `safeColor` + URL protocol check).
6. [ ] **Every HTML entry has a strict `Content-Security-Policy`**.
7. [ ] **Auth tokens are 256-bit random & compared with `crypto.timingSafeEqual`**.
8. [ ] **Local APIs check `Host` + `Origin` + rate limits + body size limits**.
9. [ ] **AI features reading untrusted text disable automatic tool execution (`allowActions: false`)**.
10. [ ] **Run `npm run verify` and confirm `git status` shows zero logs/binaries/secrets before pushing!**
