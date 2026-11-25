const { shell } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { focusAppWindow } = require('./desktopAwareness');
const { writeLog } = require('./security');

const BRAVE_CANDIDATES = [
  path.join(process.env.PROGRAMFILES || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
];

function findBraveExe() {
  for (const p of BRAVE_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Reliable async detached process launcher:
 * - Waits for Node's 'spawn' or 'error' event (fixes false positives on ENOENT!)
 * - Keeps windowsHide=false for interactive GUI/terminal apps so CMD/PowerShell never open hidden!
 */
function spawnDetached(exe, args = [], opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const child = spawn(exe, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: opts.windowsHide === true,
      });
      child.once('error', () => finish(false));
      child.once('spawn', () => {
        try { child.unref(); } catch {}
        finish(true);
      });
      setTimeout(() => finish(true), 450);
    } catch {
      finish(false);
    }
  });
}

/**
 * Launches interactive Windows console windows (CMD, PowerShell, Windows Terminal) visibly.
 * On Windows, detached:true + windowsHide:false passes CREATE_NEW_CONSOLE via libuv so
 * cmd.exe / powershell.exe / wt.exe open directly in a crisp visible window without quoting bugs!
 */
function spawnInteractiveConsole(exePath, extraArgs = []) {
  const safeExe = String(exePath || '').trim();
  if (!safeExe) return Promise.resolve(false);
  return spawnDetached(safeExe, extraArgs, { windowsHide: false });
}

function normalizeWebsiteUrl(rawInput) {
  let s = String(rawInput || '').trim();
  if (!s) return null;
  s = s.replace(/^(?:website|site|url|web)\s+/i, '').replace(/\s+(?:website|site)$/i, '').trim();

  // Direct http(s):// URL
  if (/^https?:\/\//i.test(s)) {
    if (/^https:\/\/[^\s"'<>`]+$/i.test(s)) return s;
    if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s"'<>`]*)?$/i.test(s)) return s;
    return null;
  }

  // Bare domain like "chatgpt.com", "github.com/vercel", "news.ycombinator.com", "linear.app"
  if (/^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,16})+(?:\/[^\s"'<>`]*)?$/i.test(s)) {
    return `https://${s}`;
  }
  return null;
}

/**
 * Opens any validated https:// or local http://127.0.0.1 URL directly in Brave Browser!
 * When `asApp: true`, launches it in Brave standalone App Mode (--app=<url>) like a native desktop app!
 */
async function openInBrave(url, opts = {}) {
  const safe = String(url || '').trim();
  if (!/^https:\/\/[^\s"'<>`]+$/i.test(safe) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s"'<>`]*)?$/i.test(safe)) {
    return { ok: false, error: 'Blocked unsafe URL scheme' };
  }
  const brave = findBraveExe();
  const args = opts.asApp ? [`--app=${safe}`] : [safe];
  if (brave && (await spawnDetached(brave, args))) {
    return { ok: true, browser: opts.asApp ? 'Brave App' : 'Brave', url: safe };
  }
  try {
    await shell.openExternal(safe);
    return { ok: true, browser: 'Default', url: safe };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const POPULAR_WEBSITES = {
  youtube: { label: 'YouTube', url: 'https://www.youtube.com' },
  yt: { label: 'YouTube', url: 'https://www.youtube.com' },
  reddit: { label: 'Reddit', url: 'https://www.reddit.com' },
  github: { label: 'GitHub', url: 'https://github.com' },
  gmail: { label: 'Gmail', url: 'https://mail.google.com' },
  instagram: { label: 'Instagram', url: 'https://www.instagram.com' },
  insta: { label: 'Instagram', url: 'https://www.instagram.com' },
  twitter: { label: 'X (Twitter)', url: 'https://x.com' },
  x: { label: 'X (Twitter)', url: 'https://x.com' },
  linkedin: { label: 'LinkedIn', url: 'https://www.linkedin.com' },
  netflix: { label: 'Netflix', url: 'https://www.netflix.com' },
  figma: { label: 'Figma', url: 'https://www.figma.com' },
  notion: { label: 'Notion', url: 'https://www.notion.so' },
  vercel: { label: 'Vercel', url: 'https://vercel.com' },
  stackoverflow: { label: 'Stack Overflow', url: 'https://stackoverflow.com' },
  claudeweb: { label: 'Claude Web', url: 'https://claude.ai' },
  chatgptweb: { label: 'ChatGPT Web', url: 'https://chatgpt.com' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com' },
  perplexity: { label: 'Perplexity', url: 'https://www.perplexity.ai' },
  huggingface: { label: 'Hugging Face', url: 'https://huggingface.co' },
  leetcode: { label: 'LeetCode', url: 'https://leetcode.com' },
  canva: { label: 'Canva', url: 'https://www.canva.com' },
  drive: { label: 'Google Drive', url: 'https://drive.google.com' },
  docs: { label: 'Google Docs', url: 'https://docs.google.com' },
  sheets: { label: 'Google Sheets', url: 'https://sheets.google.com' },
  maps: { label: 'Google Maps', url: 'https://maps.google.com' },
  twitch: { label: 'Twitch', url: 'https://www.twitch.tv' },
  amazon: { label: 'Amazon', url: 'https://www.amazon.in' },
  flipkart: { label: 'Flipkart', url: 'https://www.flipkart.com' },
  whatsappweb: { label: 'WhatsApp Web', url: 'https://web.whatsapp.com' },
  spotifyweb: { label: 'Spotify Web', url: 'https://open.spotify.com' },
  discordweb: { label: 'Discord Web', url: 'https://discord.com/app' },
  google: { label: 'Brave Search', url: 'https://search.brave.com' },
};

const ALLOWLISTED_APPS = {
  brave: {
    label: 'Brave',
    strictFocus: false,
    candidates: BRAVE_CANDIDATES,
    appUserModelId: 'Brave',
  },
  spotify: {
    label: 'Spotify',
    strictFocus: true,
    focusHint: 'Spotify',
    candidates: [
      path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'Spotify.exe'),
    ],
    protocol: 'spotify:',
  },
  youtube: { label: 'YouTube', urlInBrave: 'https://www.youtube.com' },
  reddit: { label: 'Reddit', urlInBrave: 'https://www.reddit.com' },
  github: { label: 'GitHub', urlInBrave: 'https://github.com' },
  whatsapp: {
    label: 'WhatsApp',
    strictFocus: false,
    appUserModelId: '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App',
    protocol: 'whatsapp:',
  },
  terminal: {
    label: 'Terminal',
    alwaysNew: true,
    appUserModelId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App',
    consoleExe: 'wt.exe',
  },
  cmd: {
    label: 'Command Prompt',
    alwaysNew: true,
    consoleExe: path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'cmd.exe'),
    appUserModelId: '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\cmd.exe',
  },
  powershell: {
    label: 'PowerShell',
    alwaysNew: true,
    consoleExe: path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    appUserModelId: '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe',
  },
  gitbash: {
    label: 'Git Bash',
    alwaysNew: true,
    candidates: [
      path.join(process.env.PROGRAMFILES || '', 'Git', 'git-bash.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Git', 'git-bash.exe'),
    ],
    startAppName: 'Git Bash',
  },
  vscode: {
    label: 'VS Code',
    strictFocus: true,
    focusHint: 'Code',
    candidates: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Microsoft VS Code', 'Code.exe'),
    ],
    appUserModelId: 'Microsoft.VisualStudioCode',
  },
  antigravity: {
    label: 'Antigravity',
    strictFocus: true,
    focusHint: 'Antigravity',
    candidates: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe'),
    ],
    appUserModelId: 'electron.app.Antigravity',
  },
  cursor: {
    label: 'Cursor',
    strictFocus: true,
    focusHint: 'Cursor',
    candidates: [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Cursor', 'Cursor.exe'),
    ],
    appUserModelId: 'Anysphere.Cursor',
  },
  discord: {
    label: 'Discord',
    strictFocus: true,
    focusHint: 'Discord',
    appUserModelId: 'com.squirrel.Discord.Discord',
    protocol: 'discord:',
  },
  claude: {
    label: 'Claude',
    strictFocus: true,
    focusHint: 'Claude',
    appUserModelId: 'Claude_pzs8sxrjxfjjc!Claude',
    urlFallback: 'https://claude.ai',
  },
  chatgpt: {
    label: 'ChatGPT',
    appUserModelId: 'OpenAI.Codex_2p2nqsd0c76g0!App',
    urlFallback: 'https://chatgpt.com',
  },
  postman: {
    label: 'Postman',
    strictFocus: true,
    focusHint: 'Postman',
    appUserModelId: 'com.squirrel.Postman.Postman',
  },
  lmstudio: {
    label: 'LM Studio',
    strictFocus: true,
    focusHint: 'LM Studio',
    appUserModelId: 'ai.elementlabs.lmstudio',
  },
  opencode: {
    label: 'OpenCode',
    appUserModelId: 'ai.opencode.desktop',
  },
  vlc: {
    label: 'VLC',
    candidates: [
      path.join(process.env.PROGRAMFILES || '', 'VideoLAN', 'VLC', 'vlc.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'VideoLAN', 'VLC', 'vlc.exe'),
    ],
    startAppName: 'VLC media player',
  },
  notepad: {
    label: 'Notepad',
    alwaysNew: true,
    appUserModelId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
    candidates: [path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'notepad.exe')],
  },
  calculator: {
    label: 'Calculator',
    alwaysNew: true,
    appUserModelId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
    candidates: [path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'calc.exe')],
  },
  paint: {
    label: 'Paint',
    alwaysNew: true,
    appUserModelId: 'Microsoft.Paint_8wekyb3d8bbwe!App',
    candidates: [path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'mspaint.exe')],
  },
  snipping: {
    label: 'Snipping Tool',
    alwaysNew: true,
    appUserModelId: 'Microsoft.ScreenSketch_8wekyb3d8bbwe!App',
    protocol: 'ms-screenclip:',
  },
  taskmgr: {
    label: 'Task Manager',
    alwaysNew: true,
    candidates: [path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'Taskmgr.exe')],
  },
  settings: {
    label: 'Settings',
    alwaysNew: true,
    protocol: 'ms-settings:',
  },
  camera: {
    label: 'Camera',
    alwaysNew: true,
    appUserModelId: 'Microsoft.WindowsCamera_8wekyb3d8bbwe!App',
  },
  clock: {
    label: 'Clock',
    alwaysNew: true,
    appUserModelId: 'Microsoft.WindowsAlarms_8wekyb3d8bbwe!App',
  },
  phonelink: {
    label: 'Phone Link',
    appUserModelId: 'Microsoft.YourPhone_8wekyb3d8bbwe!App',
  },
  wispr: {
    label: 'Wispr Flow',
    strictFocus: true,
    focusHint: 'Wispr',
    appUserModelId: 'com.squirrel.WisprFlow.WisprFlow',
    candidates: [
      path.join(process.env.LOCALAPPDATA || '', 'WisprFlow', 'Wispr Flow.exe'),
    ],
  },
  'bgm-nemo': {
    label: 'Coral Ocean Focus',
    urlInBrave: 'https://www.youtube.com/results?search_query=calm+underwater+ambient+study+music+deep+ocean+focus',
  },
  'bgm-spidey': {
    label: 'Vesper Acrobat Lo-Fi',
    urlInBrave: 'https://www.youtube.com/results?search_query=chill+lofi+hip+hop+beats+coding+study+session',
  },
  'bgm-ironman': {
    label: 'Vector Tech Synthwave',
    urlInBrave: 'https://www.youtube.com/results?search_query=electronic+synthwave+instrumental+coding+focus+mix',
  },
  'bgm-batman': {
    label: 'Umbra Dark Focus Ambient',
    urlInBrave: 'https://www.youtube.com/results?search_query=dark+cinematic+ambient+deep+focus+study+music',
  },
  'bgm-capybara': {
    label: 'Capybara Zen Nature Lo-Fi',
    urlInBrave: 'https://www.youtube.com/results?search_query=relaxing+nature+lofi+acoustic+calm+study+music',
  },
  'bgm-cat': {
    label: 'Cat Cozy Cafe Jazz',
    urlInBrave: 'https://www.youtube.com/results?search_query=cozy+rainy+cafe+jazz+piano+focus+music',
  },
  'bgm-dog': {
    label: 'Dog Upbeat Acoustic Focus',
    urlInBrave: 'https://www.youtube.com/results?search_query=upbeat+acoustic+indie+instrumental+happy+work+music',
  },
  explorer: {
    label: 'Files',
    alwaysNew: true,
    candidates: [path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe')],
  },
};

// Cached Windows Get-StartApps verified catalog so ANY installed app can be safely launched!
let startAppsCache = [];
let startAppsLoadedAt = 0;

function refreshStartAppsIndex() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'],
      { windowsHide: true, timeout: 6000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (!err && stdout) {
          try {
            const parsed = JSON.parse(stdout.trim());
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            startAppsCache = arr
              .filter((x) => x && x.Name && x.AppID && !/^https?:\/\//i.test(x.AppID))
              .map((x) => ({
                name: String(x.Name).trim(),
                lower: String(x.Name).trim().toLowerCase(),
                appId: String(x.AppID).trim(),
              }));
            startAppsLoadedAt = Date.now();
            writeLog('INFO', `AppLauncher indexed ${startAppsCache.length} installed Windows Start Apps`);
          } catch {}
        }
        resolve(startAppsCache);
      }
    );
  });
}

function getIndexedStartApps() {
  return startAppsCache;
}

function findBestStartApp(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q || q.length < 2 || startAppsCache.length === 0) return null;

  // Priority: exact name -> startsWith -> word match -> substring match (avoid uninstallers/release notes)
  const clean = startAppsCache.filter((a) => !/uninstall|release notes|faq|reset preferences/i.test(a.lower));
  return (
    clean.find((a) => a.lower === q) ||
    clean.find((a) => a.lower.startsWith(q)) ||
    clean.find((a) => a.lower.split(/\s+/).includes(q)) ||
    clean.find((a) => a.lower.includes(q)) ||
    null
  );
}

async function launchStartAppByEntry(entry) {
  if (!entry || !entry.appId) return false;
  const appId = String(entry.appId).trim();
  if (!appId || /[\x00-\x1f"'`$|&;<>]/.test(appId) || appId.includes('..')) return false;
  // Direct executable path returned by Get-StartApps (e.g. Spotify.exe, Ollama)
  if (/^[a-zA-Z]:\\.+\.exe$/i.test(appId) && fs.existsSync(appId)) {
    return spawnDetached(appId, []);
  }
  return spawnDetached('explorer.exe', [`shell:AppsFolder\\${appId}`]);
}

function resolveAliasKey(raw) {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/\b(please|bro|app|desktop|now|for me)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const aliasMap = [
    [/^(brave|chrome|google chrome|browser)$/, 'brave'],
    [/^(spotify|music|gaana|songs?)$/, 'spotify'],
    [/^(youtube|yt)$/, 'youtube'],
    [/^(reddit)$/, 'reddit'],
    [/^(whatsapp|wa|whats\s*app)$/, 'whatsapp'],
    [/^(vs\s*code|vscode|visual studio code|code)$/, 'vscode'],
    [/^(terminal|windows terminal|wt)$/, 'terminal'],
    [/^(cmd|command prompt|command|dos)$/, 'cmd'],
    [/^(powershell|power shell|ps|ps1|pwsh)$/, 'powershell'],
    [/^(git\s*bash|bash)$/, 'gitbash'],
    [/^(antigravity|agy)$/, 'antigravity'],
    [/^(cursor)$/, 'cursor'],
    [/^(discord)$/, 'discord'],
    [/^(claude|claude desktop)$/, 'claude'],
    [/^(chatgpt|gpt)$/, 'chatgpt'],
    [/^(postman)$/, 'postman'],
    [/^(lm\s*studio|lmstudio)$/, 'lmstudio'],
    [/^(opencode|open code)$/, 'opencode'],
    [/^(vlc|vlc player)$/, 'vlc'],
    [/^(notepad|notes)$/, 'notepad'],
    [/^(calc|calculator)$/, 'calculator'],
    [/^(paint|mspaint)$/, 'paint'],
    [/^(snip|snipping|snipping tool|screenshot)$/, 'snipping'],
    [/^(task\s*manager|taskmgr|task\s*mgr)$/, 'taskmgr'],
    [/^(settings|windows settings|control panel)$/, 'settings'],
    [/^(camera|webcam)$/, 'camera'],
    [/^(clock|alarm|alarms)$/, 'clock'],
    [/^(phone\s*link|your phone)$/, 'phonelink'],
    [/^(wispr|wispr\s*flow|dictation)$/, 'wispr'],
    [/^(github)$/, 'github'],
    [/^(files|explorer|file explorer|folder|my computer|this pc)$/, 'explorer'],
  ];

  for (const [rx, key] of aliasMap) {
    if (rx.test(clean)) return { key, clean };
  }
  return { key: null, clean };
}

/**
 * Universal Launcher:
 * 1. Curated core apps (Brave, Spotify, Terminal, CMD, PowerShell, VS Code, WhatsApp, Discord, Notepad, Calc, etc.)
 * 2. Popular websites & ANY valid domain/URL (opens in Brave, or Brave --app= standalone window if `asApp: true`)
 * 3. ANY installed Windows Start App from verified `Get-StartApps` index!
 */
async function launchAllowlistedApp(rawTarget, opts = {}) {
  const targetStr = String(rawTarget || '').trim();
  if (!targetStr) return { ok: false, error: 'Nothing specified to open' };
  const asApp = Boolean(opts.asApp);

  // 1. Direct URL or domain (e.g. "chatgpt.com", "https://vercel.com", "instagram.com")
  const directUrl = normalizeWebsiteUrl(targetStr);
  if (directUrl) {
    const r = await openInBrave(directUrl, { asApp });
    const hostLabel = directUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    return { ok: r.ok, label: asApp ? `${hostLabel} (App)` : hostLabel, url: directUrl };
  }

  const { key, clean } = resolveAliasKey(targetStr);

  // 2. If user explicitly asked "open <site> as app" and it's a known website
  const siteCompact = clean.replace(/\s+/g, '');
  if (asApp && POPULAR_WEBSITES[siteCompact]) {
    const site = POPULAR_WEBSITES[siteCompact];
    const r = await openInBrave(site.url, { asApp: true });
    return { ok: r.ok, label: `${site.label} (App)`, url: site.url };
  }

  // 3. Curated Allowlisted Desktop App
  if (key && ALLOWLISTED_APPS[key]) {
    const entry = ALLOWLISTED_APPS[key];

    if (entry.urlInBrave) {
      const r = await openInBrave(entry.urlInBrave, { asApp });
      return { ok: r.ok, label: entry.label };
    }

    if (entry.consoleExe) {
      // Launch CMD / PowerShell directly via CREATE_NEW_CONSOLE if full path exists,
      // otherwise use Windows AppsFolder AUMID (e.g. Windows Terminal) then fallback to exe!
      if (fs.existsSync(entry.consoleExe)) {
        const ok = await spawnInteractiveConsole(entry.consoleExe);
        if (ok) return { ok: true, label: entry.label };
      }
      if (entry.appUserModelId) {
        const ok = await spawnDetached('explorer.exe', [`shell:AppsFolder\\${entry.appUserModelId}`]);
        if (ok) return { ok: true, label: entry.label };
      }
      const ok = await spawnInteractiveConsole(entry.consoleExe);
      if (ok) return { ok: true, label: entry.label };
    }

    if (entry.strictFocus && entry.focusHint && !entry.alwaysNew) {
      const focused = await focusAppWindow(entry.focusHint, { strictProcess: true });
      if (focused) return { ok: true, label: entry.label, focused: true };
    }

    if (Array.isArray(entry.candidates)) {
      for (const exe of entry.candidates) {
        if (exe && fs.existsSync(exe) && (await spawnDetached(exe, []))) {
          return { ok: true, label: entry.label };
        }
      }
    }

    if (entry.appUserModelId) {
      const ok = await spawnDetached('explorer.exe', [`shell:AppsFolder\\${entry.appUserModelId}`]);
      if (ok) return { ok: true, label: entry.label };
    }

    if (entry.startAppName) {
      if (startAppsCache.length === 0) await refreshStartAppsIndex();
      const sa = findBestStartApp(entry.startAppName);
      if (sa && (await launchStartAppByEntry(sa))) {
        return { ok: true, label: entry.label };
      }
    }

    if (entry.protocol) {
      try {
        await shell.openExternal(entry.protocol);
        return { ok: true, label: entry.label };
      } catch {}
    }

    if (entry.urlFallback) {
      const r = await openInBrave(entry.urlFallback, { asApp });
      return { ok: r.ok, label: entry.label };
    }

    return { ok: false, error: `${entry.label} not found on this PC` };
  }

  // 4. Popular named websites ("open instagram", "open netflix", "open gmail", "open figma", "open gemini", "open x")
  if (POPULAR_WEBSITES[siteCompact]) {
    const site = POPULAR_WEBSITES[siteCompact];
    const r = await openInBrave(site.url, { asApp });
    return { ok: r.ok, label: asApp ? `${site.label} (App)` : site.label, url: site.url };
  }

  // 5. Dynamic verified Windows Start Apps index (opens ANY installed app on user's PC!)
  if (startAppsCache.length === 0 || Date.now() - startAppsLoadedAt > 300000) {
    await refreshStartAppsIndex();
  }
  const matchedStartApp = findBestStartApp(clean);
  if (matchedStartApp) {
    const ok = await launchStartAppByEntry(matchedStartApp);
    if (ok) return { ok: true, label: matchedStartApp.name, fromStartApps: true };
  }

  // 6. If user specifically typed "website" or "site", open Brave search or domain guess
  if (/\b(website|site|web)\b/i.test(targetStr)) {
    const slug = clean.replace(/\b(website|site|web)\b/g, '').replace(/[^a-z0-9-]/g, '');
    if (slug.length >= 2) {
      const r = await openInBrave(`https://www.${slug}.com`, { asApp });
      return { ok: r.ok, label: `${slug}.com`, url: r.url };
    }
  }

  return { ok: false, error: `Couldn't find "${targetStr}" — try a website URL (e.g. ${clean.replace(/\s+/g, '')}.com) or installed app name` };
}

/**
 * Opens the EXACT app that sent a Windows Notification!
 */
async function openNotificationSource({ handlerId = '', processHint = '', category = '' }) {
  if (category === 'whatsapp') return launchAllowlistedApp('whatsapp');
  const lower = `${handlerId} ${processHint}`.toLowerCase();
  if (lower.includes('brave')) return launchAllowlistedApp('brave');
  if (lower.includes('spotify')) return launchAllowlistedApp('spotify');
  if (lower.includes('discord')) return launchAllowlistedApp('discord');
  if (lower.includes('antigravity')) return launchAllowlistedApp('antigravity');
  if (lower.includes('cursor')) return launchAllowlistedApp('cursor');
  if (lower.includes('code')) return launchAllowlistedApp('vscode');

  if (processHint) {
    const focused = await focusAppWindow(processHint);
    if (focused) return { ok: true, focused: true };
  }

  const safeAumid = String(handlerId || '').trim();
  if (safeAumid && /^[a-zA-Z0-9._!-]{4,140}$/.test(safeAumid) && safeAumid.includes('!')) {
    const ok = await spawnDetached('explorer.exe', [`shell:AppsFolder\\${safeAumid}`]);
    return { ok, launchedAumid: ok };
  }

  return { ok: false };
}

async function openLocalhostPort(port) {
  const num = Number(port);
  if (!Number.isInteger(num) || num < 1024 || num > 65535) return false;
  const r = await openInBrave(`http://127.0.0.1:${num}`);
  return r.ok;
}

async function searchInBrave(engine, query) {
  const q = encodeURIComponent(String(query || '').trim().slice(0, 140));
  if (!q) return { ok: false };
  if (engine === 'youtube') return openInBrave(`https://www.youtube.com/results?search_query=${q}`);
  if (engine === 'reddit') return openInBrave(`https://www.reddit.com/search/?q=${q}`);
  return openInBrave(`https://search.brave.com/search?q=${q}`);
}

module.exports = {
  launchAllowlistedApp,
  openNotificationSource,
  openLocalhostPort,
  openInBrave,
  searchInBrave,
  refreshStartAppsIndex,
  getIndexedStartApps,
  normalizeWebsiteUrl,
  ALLOWLISTED_APPS,
  POPULAR_WEBSITES,
};
