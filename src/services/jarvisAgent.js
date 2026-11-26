const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { sanitizeProcessHint } = require('./security');

const WINGET_PACKAGES = {
  vlc: 'VideoLAN.VLC',
  chrome: 'Google.Chrome',
  'google chrome': 'Google.Chrome',
  brave: 'Brave.Brave',
  discord: 'Discord.Discord',
  spotify: 'Spotify.Spotify',
  python: 'Python.Python.3.12',
  git: 'Git.Git',
  obs: 'OBSProject.OBSStudio',
  'obs studio': 'OBSProject.OBSStudio',
  '7zip': '7zip.7zip',
  '7-zip': '7zip.7zip',
  'notepad++': 'Notepad++.Notepad++',
  vscode: 'Microsoft.VisualStudioCode',
  'vs code': 'Microsoft.VisualStudioCode',
  postman: 'Postman.Postman',
  ollama: 'Ollama.Ollama',
  steam: 'Valve.Steam',
  telegram: 'Telegram.TelegramDesktop',
  figma: 'Figma.Figma',
  notion: 'Notion.Notion',
  winrar: 'RARLab.WinRAR',
  node: 'OpenJS.NodeJS.LTS',
  nodejs: 'OpenJS.NodeJS.LTS',
};

const SYSTEM_BLOCKED_PROCESSES = new Set([
  'explorer', 'csrss', 'lsass', 'svchost', 'wininit', 'winlogon', 'dwm', 'services', 'smss', 'system', 'electron',
]);

function normalizeProjectName(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isProtectedPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return true;
  let resolved;
  try {
    resolved = path.resolve(targetPath).toLowerCase();
  } catch {
    return true;
  }
  // Drive roots like C:\ or D:\
  if (/^[a-z]:\\?$/.test(resolved)) return true;

  const winDir = (process.env.WINDIR || 'C:\\Windows').toLowerCase();
  const pf = (process.env.PROGRAMFILES || 'C:\\Program Files').toLowerCase();
  const pf86 = (process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)').toLowerCase();
  const pdata = (process.env.PROGRAMDATA || 'C:\\ProgramData').toLowerCase();

  const sysRoots = [winDir, pf, pf86, pdata, 'c:\\system volume information', 'c:\\recovery', 'c:\\$recycle.bin'];
  for (const r of sysRoots) {
    if (resolved === r || resolved.startsWith(r + path.sep)) return true;
  }

  const home = os.homedir().toLowerCase();
  const protectedExact = new Set([
    home,
    path.join(home, 'desktop'),
    path.join(home, 'documents'),
    path.join(home, 'downloads'),
    path.join(home, 'pictures'),
    path.join(home, 'videos'),
    path.join(home, 'music'),
    path.join(home, 'appdata'),
    path.join(home, 'appdata', 'local'),
    path.join(home, 'appdata', 'roaming'),
  ]);
  if (protectedExact.has(resolved)) return true;

  return false;
}

function extractFirstYouTubeVideoId(html) {
  const s = String(html || '');
  const rx = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
  const seen = new Set();
  let m;
  while ((m = rx.exec(s)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
  }
  return null;
}

function bigramSimilarity(a, b) {
  const sa = normalizeProjectName(a).replace(/\s+/g, '');
  const sb = normalizeProjectName(b).replace(/\s+/g, '');
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) return sa === sb ? 1 : 0;
  const mapA = new Map();
  for (let i = 0; i < sa.length - 1; i++) {
    const bg = sa.slice(i, i + 2);
    mapA.set(bg, (mapA.get(bg) || 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < sb.length - 1; i++) {
    const bg = sb.slice(i, i + 2);
    const cnt = mapA.get(bg) || 0;
    if (cnt > 0) {
      inter++;
      mapA.set(bg, cnt - 1);
    }
  }
  return (2 * inter) / ((sa.length - 1) + (sb.length - 1));
}

function scoreFolderMatch(folderName, query) {
  const fn = normalizeProjectName(folderName);
  const qn = normalizeProjectName(query);
  if (!fn || !qn) return 0;
  if (fn === qn) return 1.0;
  if (fn.replace(/\s+/g, '') === qn.replace(/\s+/g, '')) return 0.98;
  if (fn.startsWith(qn)) return 0.9;
  if (fn.includes(qn)) return 0.85;

  const qTokens = qn.split(' ').filter(Boolean);
  const fTokens = fn.split(' ').filter(Boolean);
  if (qTokens.length > 0) {
    const hits = qTokens.filter((t) => fTokens.some((ft) => ft === t || ft.startsWith(t) || t.startsWith(ft)));
    const ratio = hits.length / Math.max(qTokens.length, fTokens.length);
    if (hits.length === qTokens.length) return Math.max(0.75, 0.72 + ratio * 0.2);
    if (ratio >= 0.5) return 0.5 + ratio * 0.3;
  }
  return bigramSimilarity(fn, qn) * 0.8;
}

class JarvisAgent {
  constructor(deps = {}) {
    this.launchAllowlistedApp = deps.launchAllowlistedApp || (async () => ({ ok: false }));
    this.openInBrave = deps.openInBrave || (async () => ({ ok: false }));
    this.searchInBrave = deps.searchInBrave || (async () => ({ ok: false }));
    this.focusAppWindow = deps.focusAppWindow || (async () => false);
    this.systemControls = deps.systemControls || null;
    this.musicDetector = deps.musicDetector || null;
    this.autoPilot = deps.autoPilot || null;
    this.clipboard = deps.clipboard || null;
    this.writeLog = deps.writeLog || (() => {});
    this.setPetCharacter = deps.setPetCharacter || (() => {});
    this.setPetMode = deps.setPetMode || (() => {});
    this.toggleDanceMode = deps.toggleDanceMode || (() => {});
    this.announceActiveAgent = deps.announceActiveAgent || (async () => ({ ok: false }));
    this.triggerPetReaction = deps.triggerPetReaction || (() => {});
    this._folderCache = null;
    this._folderCacheAt = 0;
  }

  indexProjectFolders(force = false) {
    if (!force && this._folderCache && Date.now() - this._folderCacheAt < 60000) {
      return this._folderCache;
    }
    const home = os.homedir();
    const roots = [
      home,
      path.join(home, 'Projects'),
      path.join(home, 'Desktop'),
      path.join(home, 'Documents'),
      path.join(home, 'Downloads'),
      path.join(home, '.gemini', 'antigravity', 'scratch'),
      'C:\\x',
    ];
    const skip = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'logs', 'dist', 'build', 'out', 'coverage']);
    const seen = new Set();
    const list = [];

    const scanDir = (dir, depth) => {
      if (depth > 2 || !fs.existsSync(dir)) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const lower = ent.name.toLowerCase();
        if (skip.has(lower)) continue;
        if (lower.startsWith('.') && lower !== '.gemini') continue;
        const full = path.join(dir, ent.name);
        if (!seen.has(full.toLowerCase())) {
          seen.add(full.toLowerCase());
          list.push({ name: ent.name, path: full });
        }
        if (depth < 2) {
          scanDir(full, depth + 1);
        }
      }
    };

    for (const r of roots) {
      if (fs.existsSync(r)) {
        if (r === 'C:\\x' || r.endsWith('scratch')) {
          scanDir(r, 2);
        } else {
          scanDir(r, 1);
        }
      }
    }

    this._folderCache = list;
    this._folderCacheAt = Date.now();
    return list;
  }

  findProjectFolder(query) {
    const q = normalizeProjectName(query);
    if (!q) return null;
    const folders = this.indexProjectFolders();
    let best = null;
    let bestScore = 0;
    for (const f of folders) {
      const s = scoreFolderMatch(f.name, q);
      if (s > bestScore) {
        bestScore = s;
        best = f;
      }
    }
    return bestScore >= 0.45 ? { ...best, score: bestScore } : null;
  }

  resolveBaseDir(baseAlias) {
    const home = os.homedir();
    const alias = String(baseAlias || 'desktop').toLowerCase().trim();
    if (!alias || alias === 'desktop') return path.join(home, 'Desktop');
    if (alias === 'downloads' || alias === 'download') return path.join(home, 'Downloads');
    if (alias === 'documents' || alias === 'docs' || alias === 'document') return path.join(home, 'Documents');
    if (alias === 'projects' || alias === 'project') {
      const p = path.join(home, 'Projects');
      return fs.existsSync(p) ? p : path.join(home, 'Desktop');
    }
    if (alias === 'pictures' || alias === 'screenshots') return path.join(home, 'Pictures');
    if (alias === 'home' || alias === 'user') return home;
    if (path.isAbsolute(alias)) return path.resolve(alias);
    return path.join(home, 'Desktop');
  }

  sanitizeEntryName(rawName) {
    return String(rawName || '')
      .replace(/[<>:"|?*]/g, '')
      .replace(/\.\.+/g, '')
      .replace(/^[/\\]+|[/\\]+$/g, '')
      .trim()
      .slice(0, 80);
  }

  async playYouTubeDirect(query) {
    const q = String(query || '').trim();
    if (!q) return { ok: false, summary: 'No song or video specified for YouTube.' };
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

    const fetchHtml = (urlStr) => new Promise((resolve) => {
      const req = https.get(
        urlStr,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 4500,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return resolve('');
          }
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => {
            if (data.length < 700000) data += c;
          });
          res.on('end', () => resolve(data));
        }
      );
      req.on('timeout', () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    });

    const html = await fetchHtml(searchUrl);
    const videoId = extractFirstYouTubeVideoId(html);
    if (videoId) {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
      const res = await this.openInBrave(watchUrl);
      return {
        ok: Boolean(res?.ok),
        videoId,
        url: watchUrl,
        summary: `Playing "${q}" directly on YouTube`,
      };
    }

    const res = await this.openInBrave(searchUrl);
    return {
      ok: Boolean(res?.ok),
      url: searchUrl,
      summary: `Opened YouTube results for "${q}"`,
    };
  }

  resolveIdeExecutable(ide) {
    const key = String(ide || 'antigravity').toLowerCase();
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const candidates = {
      antigravity: [
        path.join(local, 'Programs', 'Antigravity', 'Antigravity.exe'),
      ],
      vscode: [
        path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(pf, 'Microsoft VS Code', 'Code.exe'),
      ],
      cursor: [
        path.join(local, 'Programs', 'cursor', 'Cursor.exe'),
        path.join(local, 'Programs', 'Cursor', 'Cursor.exe'),
      ],
    };
    for (const c of candidates[key] || []) {
      if (c && fs.existsSync(c)) return c;
    }
    return null;
  }

  async dispatchIdeChatPrompt(ideName, instruction, waitBeforeKeysMs = 1800) {
    const text = String(instruction || '').trim();
    if (!text) return false;
    try {
      if (this.clipboard) this.clipboard.writeText(text);
    } catch {}

    await new Promise((r) => setTimeout(r, waitBeforeKeysMs));
    await this.focusAppWindow(sanitizeProcessHint(ideName), { strictProcess: false });

    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class JarvisIdeKeys {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
$hint = $env:PETFISH_FOCUS_HINT
$proc = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like "*$hint*" -or $_.MainWindowTitle -like "*$hint*")
} | Select-Object -First 1
if ($proc) {
  $h = $proc.MainWindowHandle
  if ([JarvisIdeKeys]::IsIconic($h)) { [void][JarvisIdeKeys]::ShowWindowAsync($h, 9) }
  [void][JarvisIdeKeys]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait("^l")
  Start-Sleep -Milliseconds 380
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 260
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  "DISPATCHED"
} else {
  "NO_WINDOW"
}
`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        {
          windowsHide: true,
          timeout: 8000,
          env: {
            ...process.env,
            PETFISH_FOCUS_HINT: sanitizeProcessHint(ideName),
          },
        },
        (err, stdout) => {
          resolve(!err && String(stdout || '').includes('DISPATCHED'));
        }
      );
    });
  }

  async openIdeProjectAndPrompt({ ide = 'antigravity', projectQuery = '', instruction = '' }) {
    const ideKey = /cursor/i.test(ide) ? 'cursor' : /code|vs/i.test(ide) ? 'vscode' : 'antigravity';
    const ideLabel = ideKey === 'cursor' ? 'Cursor' : ideKey === 'vscode' ? 'VS Code' : 'Antigravity';
    const exe = this.resolveIdeExecutable(ideKey);

    let folderMatch = null;
    if (projectQuery) {
      folderMatch = this.findProjectFolder(projectQuery);
    }

    const args = folderMatch ? [folderMatch.path] : [];
    let launched = false;
    if (exe) {
      try {
        const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        launched = true;
      } catch {}
    }
    if (!launched) {
      const r = await this.launchAllowlistedApp(ideKey, {});
      launched = Boolean(r?.ok);
    }

    let dispatched = false;
    if (instruction) {
      dispatched = await this.dispatchIdeChatPrompt(ideLabel, instruction, folderMatch ? 2600 : 1600);
    }

    const projPart = folderMatch
      ? `project "${folderMatch.name}"`
      : (projectQuery ? `(folder "${projectQuery}" not found locally, opened ${ideLabel})` : ideLabel);
    const promptPart = instruction
      ? (dispatched ? ` & sent prompt "${instruction.slice(0, 48)}"` : ` (copied prompt to clipboard for chat)`)
      : '';

    return {
      ok: launched,
      ide: ideLabel,
      folderPath: folderMatch ? folderMatch.path : null,
      dispatchedPrompt: dispatched ? instruction : null,
      summary: `Opened ${ideLabel} ${projPart}${promptPart}`.trim(),
    };
  }

  createFolder({ name, baseDir = 'desktop', scaffold = '' }, opts = {}) {
    const cleanName = this.sanitizeEntryName(name) || `OV-Project-${Date.now().toString().slice(-4)}`;
    const parent = this.resolveBaseDir(baseDir);
    const fullPath = path.resolve(parent, cleanName);

    if (isProtectedPath(fullPath)) {
      return { ok: false, blocked: true, summary: 'Blocked: cannot create folder inside protected system path.' };
    }

    fs.mkdirSync(fullPath, { recursive: true });
    const createdFiles = [];

    if (/web|html|site/i.test(scaffold)) {
      const htmlPath = path.join(fullPath, 'index.html');
      const cssPath = path.join(fullPath, 'styles.css');
      const jsPath = path.join(fullPath, 'script.js');
      if (!fs.existsSync(htmlPath)) {
        fs.writeFileSync(htmlPath, `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${cleanName}</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main><h1>${cleanName}</h1><p>Scaffolded by OV JARVIS.</p></main>\n  <script src="script.js"></script>\n</body>\n</html>\n`, 'utf8');
        createdFiles.push('index.html');
      }
      if (!fs.existsSync(cssPath)) {
        fs.writeFileSync(cssPath, `body { font-family: system-ui, sans-serif; margin: 2rem; background: #101114; color: #f2efe9; }\n`, 'utf8');
        createdFiles.push('styles.css');
      }
      if (!fs.existsSync(jsPath)) {
        fs.writeFileSync(jsPath, `console.log('${cleanName} ready');\n`, 'utf8');
        createdFiles.push('script.js');
      }
    } else if (/react|node|python|project|app/i.test(scaffold)) {
      fs.mkdirSync(path.join(fullPath, 'src'), { recursive: true });
      const readmePath = path.join(fullPath, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, `# ${cleanName}\n\nCreated by OV JARVIS Voice Agent.\n`, 'utf8');
        createdFiles.push('README.md', 'src/');
      }
    }

    if (!opts.noExplorer) {
      try {
        const exp = spawn('explorer.exe', [fullPath], { detached: true, stdio: 'ignore', windowsHide: false });
        exp.unref();
      } catch {}
    }

    const extra = createdFiles.length > 0 ? ` with ${createdFiles.join(', ')}` : '';
    return {
      ok: true,
      fullPath,
      createdFiles,
      summary: `Created folder "${cleanName}"${extra} at ${parent}`,
    };
  }

  createFile({ name, baseDir = 'desktop', content = '' }) {
    const cleanName = this.sanitizeEntryName(name) || `note-${Date.now().toString().slice(-4)}.txt`;
    const parent = this.resolveBaseDir(baseDir);
    const fullPath = path.resolve(parent, cleanName);
    if (isProtectedPath(fullPath)) {
      return { ok: false, blocked: true, summary: 'Blocked protected path.' };
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, String(content || `Created by OV JARVIS on ${new Date().toISOString()}\n`), 'utf8');
    return { ok: true, fullPath, summary: `Created file "${cleanName}" in ${parent}` };
  }

  resolveDeleteTarget(targetName, baseDir = '') {
    const raw = String(targetName || '').trim();
    if (!raw) return null;
    if (path.isAbsolute(raw) && fs.existsSync(raw)) return path.resolve(raw);

    const clean = this.sanitizeEntryName(raw);
    if (!clean) return null;

    const searchRoots = baseDir
      ? [this.resolveBaseDir(baseDir)]
      : [
          path.join(os.homedir(), 'Desktop'),
          path.join(os.homedir(), 'Downloads'),
          path.join(os.homedir(), 'Documents'),
          path.join(os.homedir(), 'Projects'),
        ];

    for (const root of searchRoots) {
      const exact = path.join(root, clean);
      if (fs.existsSync(exact)) return path.resolve(exact);
    }

    // Fuzzy case-insensitive search in those top directories
    const normTarget = normalizeProjectName(clean);
    for (const root of searchRoots) {
      if (!fs.existsSync(root)) continue;
      try {
        const entries = fs.readdirSync(root);
        for (const e of entries) {
          if (e.toLowerCase() === clean.toLowerCase() || normalizeProjectName(e) === normTarget) {
            return path.resolve(path.join(root, e));
          }
        }
      } catch {}
    }
    return null;
  }

  async deleteToRecycleBin({ targetName = '', baseDir = '', fullPath = '' }) {
    const resolved = fullPath ? path.resolve(fullPath) : this.resolveDeleteTarget(targetName, baseDir);
    if (!resolved || !fs.existsSync(resolved)) {
      return { ok: false, summary: `Could not find "${targetName || fullPath}" to delete.` };
    }
    if (isProtectedPath(resolved)) {
      this.writeLog('WARN', `JARVIS blocked protected delete attempt: ${resolved}`);
      return { ok: false, blocked: true, summary: 'Blocked: protected Windows/user root folder cannot be deleted.' };
    }

    const ps = `
Add-Type -AssemblyName Microsoft.VisualBasic
$p = $env:OV_RECYCLE_TARGET
if (-not $p) { throw "Missing target" }
if (Test-Path -LiteralPath $p -PathType Container) {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
  "RECYCLED_DIR"
} elseif (Test-Path -LiteralPath $p -PathType Leaf) {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
  "RECYCLED_FILE"
} else {
  "NOT_FOUND"
}
`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        {
          windowsHide: true,
          timeout: 8000,
          env: { ...process.env, OV_RECYCLE_TARGET: resolved },
        },
        (err, stdout) => {
          const out = String(stdout || '').trim();
          if (!err && (out.includes('RECYCLED_DIR') || out.includes('RECYCLED_FILE'))) {
            resolve({ ok: true, recycled: resolved, summary: `Moved "${path.basename(resolved)}" to Recycle Bin.` });
          } else {
            resolve({ ok: false, summary: `Could not recycle "${path.basename(resolved)}": ${err ? err.message : out}` });
          }
        }
      );
    });
  }

  downloadHttpsFile(urlStr, maxRedirects = 5) {
    return new Promise((resolve) => {
      if (!/^https:\/\/[^\s"'<>`]+$/i.test(urlStr)) {
        return resolve({ ok: false, summary: 'Only secure https:// download URLs are allowed.' });
      }
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      const req = https.get(urlStr, { headers: { 'User-Agent': 'OV-JARVIS/8.1' }, timeout: 15000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          res.resume();
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          return resolve(this.downloadHttpsFile(nextUrl, maxRedirects - 1));
        }
        if (res.statusCode >= 400) {
          res.resume();
          return resolve({ ok: false, summary: `Download failed (HTTP ${res.statusCode}).` });
        }
        let rawName = path.basename(new URL(urlStr).pathname) || `download-${Date.now()}`;
        rawName = this.sanitizeEntryName(rawName) || `download-${Date.now()}.bin`;
        const dest = path.join(downloadsDir, rawName);
        const ws = fs.createWriteStream(dest);
        let bytes = 0;
        const limit = 250 * 1024 * 1024;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > limit) {
            req.destroy();
            ws.destroy();
            try { fs.unlinkSync(dest); } catch {}
            resolve({ ok: false, summary: 'Download exceeded 250 MB safety cap.' });
          }
        });
        res.pipe(ws);
        ws.on('finish', () => {
          resolve({ ok: true, path: dest, bytes, summary: `Downloaded "${rawName}" to Downloads.` });
        });
        ws.on('error', (e) => resolve({ ok: false, summary: e.message }));
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, summary: 'Download timed out.' }); });
      req.on('error', (e) => resolve({ ok: false, summary: e.message }));
    });
  }

  async downloadItem({ target = '', url = '' }) {
    const u = String(url || '').trim();
    const t = String(target || '').trim();

    if (u && /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?:\.git)?\/?$/i.test(u)) {
      const projectsDir = path.join(os.homedir(), 'Projects');
      fs.mkdirSync(projectsDir, { recursive: true });
      return new Promise((resolve) => {
        execFile('git', ['clone', u], { cwd: projectsDir, windowsHide: true, timeout: 60000 }, (err) => {
          if (!err) resolve({ ok: true, summary: `Cloned repository into ${projectsDir}` });
          else resolve({ ok: false, summary: `Git clone error: ${err.message}` });
        });
      });
    }

    if (u && /^https:\/\//i.test(u)) {
      return this.downloadHttpsFile(u);
    }

    const cleanTarget = t.toLowerCase().replace(/\b(app|software|installer|latest|please)\b/g, '').trim();
    const pkgId = WINGET_PACKAGES[cleanTarget];
    const safeNameArg = cleanTarget.replace(/[^a-zA-Z0-9.+_-]/g, ' ').trim();
    if (!pkgId && !safeNameArg) {
      return { ok: false, summary: 'Specify a software name (e.g. VLC, Git, Chrome) or HTTPS URL to download.' };
    }

    const wingetArgs = pkgId
      ? ['install', '--id', pkgId, '-e', '--accept-package-agreements', '--accept-source-agreements']
      : ['install', '--name', safeNameArg, '--accept-package-agreements', '--accept-source-agreements'];

    try {
      const child = spawn(
        'cmd.exe',
        ['/c', 'start', 'OV JARVIS Winget Installer', 'winget', ...wingetArgs],
        { detached: true, stdio: 'ignore', windowsHide: false }
      );
      child.unref();
      return { ok: true, summary: `Started winget installer for "${pkgId || safeNameArg}"` };
    } catch (err) {
      return { ok: false, summary: `Winget launch error: ${err.message}` };
    }
  }

  async setVolume(action = 'up', steps = 3) {
    const vk = action === 'mute' ? '0xAD' : action === 'down' ? '0xAE' : '0xAF';
    const count = action === 'mute' ? 1 : Math.max(1, Math.min(10, Number(steps) || 3));
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class JarvisVol {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
for ($i = 0; $i -lt ${count}; $i++) {
  [JarvisVol]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero)
  [JarvisVol]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 35
}
`;
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout: 4000 }, (err) => {
        resolve({ ok: !err, summary: action === 'mute' ? 'Toggled mute.' : `Volume ${action} (${count} steps).` });
      });
    });
  }

  async takeScreenshot() {
    const dir = path.join(os.homedir(), 'Pictures', 'Screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, `OV-Shot-${Date.now()}.png`);
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($env:OV_SHOT_OUT, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
"OK"
`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { windowsHide: true, timeout: 6000, env: { ...process.env, OV_SHOT_OUT: outFile } },
        (err, stdout) => {
          const ok = !err && String(stdout || '').includes('OK');
          if (ok) {
            try { spawn('explorer.exe', ['/select,', outFile], { detached: true, stdio: 'ignore' }).unref(); } catch {}
          }
          resolve({ ok, path: ok ? outFile : null, summary: ok ? `Screenshot saved to ${outFile}` : 'Screenshot failed.' });
        }
      );
    });
  }

  async closeApp(target) {
    const hint = sanitizeProcessHint(target).toLowerCase();
    if (!hint || SYSTEM_BLOCKED_PROCESSES.has(hint)) {
      return { ok: false, summary: `Blocked closing protected process "${target}".` };
    }
    const ps = `
$h = $env:OV_CLOSE_HINT
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName.ToLower() -like "*$h*" }
$closed = 0
foreach ($p in $procs) {
  if ($p.ProcessName.ToLower() -notin @('explorer','csrss','lsass','svchost','wininit','electron')) {
    Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
    $closed++
  }
}
Write-Output $closed
`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { windowsHide: true, timeout: 5000, env: { ...process.env, OV_CLOSE_HINT: hint } },
        (err, stdout) => {
          const cnt = Number(String(stdout || '').trim()) || 0;
          resolve({ ok: cnt > 0, summary: cnt > 0 ? `Closed ${target}.` : `No open window matched "${target}".` });
        }
      );
    });
  }

  /**
   * Natural-Language JARVIS Command Planner (EN / Hinglish / Hindi).
   * Handles compound requests, IDE project+prompt dispatch, YouTube direct auto-play,
   * folder/file scaffolding, safe Recycle Bin deletes, software/file downloads, and PC control.
   */
  planJarvisSteps(rawText) {
    let text = String(rawText || '').trim();
    if (!text) return { matched: false, steps: [] };

    // Strip natural spoken wake prefixes ("hey bro", "ok jarvis", "bhai", etc.)
    text = text
      .replace(/^(?:(?:hey|ok|yo|hi|hello|arre|sun|listen)\s+)?(?:bro|bhai|yaar|jarvis|ov|kronos|aegis|optix|orbit)\b[,:\s]*/i, '')
      .replace(/^(?:please|can you|could you|kya tum|zara|ek kaam kar)\b[,:\s]*/i, '')
      .trim();

    if (!text) return { matched: false, steps: [] };

    // 1. High-priority whole-utterance IDE + Project + Instruction parser
    // Matches: "go to antigravity and open free window radar and tell him to update the navbar"
    const ideComplexRx = /^(?:(?:go\s+to|open|launch|switch\s+to|start)\s+)?(antigravity|anti\s*gravity|vs\s*code|vscode|cursor)(?:\s+(?:and|then)\s+(?:open|load)\s+(.+?))?(?:\s+(?:and|,)\s*(?:tell\s+(?:him|it|agent|ai)|ask\s+(?:him|it|agent|ai)|say|write|type|prompt)\s+(?:to\s+)?(.+))?$/i;
    const ideMatch = text.match(ideComplexRx);
    if (ideMatch && (ideMatch[2] || ideMatch[3])) {
      return {
        matched: true,
        steps: [{
          type: 'ide_project_prompt',
          ide: ideMatch[1].replace(/\s+/g, '').toLowerCase(),
          projectQuery: (ideMatch[2] || '').replace(/^(?:project|this\s+project|folder|like|named)\s+/gi, '').trim(),
          instruction: (ideMatch[3] || '').trim(),
        }],
      };
    }

    // Alternate phrasing: "open [project] project in antigravity and tell him to [instruction]"
    const ideAltRx = /^(?:open|load)\s+(?:project\s+)?(.+?)\s+in\s+(antigravity|anti\s*gravity|vs\s*code|vscode|cursor)(?:\s+(?:and|,)\s*(?:tell\s+(?:him|it|agent|ai)|ask\s+(?:him|it|agent|ai)|to)\s+(?:to\s+)?(.+))?$/i;
    const ideAlt = text.match(ideAltRx);
    if (ideAlt) {
      return {
        matched: true,
        steps: [{
          type: 'ide_project_prompt',
          ide: ideAlt[2].replace(/\s+/g, '').toLowerCase(),
          projectQuery: ideAlt[1].replace(/^(?:the\s+)?project\s+/i, '').trim(),
          instruction: (ideAlt[3] || '').trim(),
        }],
      };
    }

    // 2. High-priority YouTube Direct Play parser
    // Matches: "go on yt play xyz song", "go to youtube and play xyz", "play xyz on youtube"
    const ytDirectRx =
      text.match(/^(?:go\s+(?:to|on)\s+)?(?:youtube|yt)(?:\s+and|\s*,)?\s+(?:play|bajao|chalao|lagao)\s+(.+)$/i) ||
      text.match(/^(?:play|bajao|chalao)\s+(.+?)\s+(?:on|in)\s+(?:youtube|yt)$/i);
    if (ytDirectRx && ytDirectRx[1].trim()) {
      return {
        matched: true,
        steps: [{ type: 'youtube_play', query: ytDirectRx[1].trim() }],
      };
    }

    // 3. Split chained compound clauses safely
    const clauses = text
      .split(/\s+(?:and\s+then|then|aur\s+phir|phir|and(?=\s+(?:open|launch|go\s+to|go\s+on|make|create|delete|remove|trash|download|install|clone|play|pause|next|skip|search|google|close|take|set|turn|remind|add|start|switch|volume|mute|screenshot)))\s+/i)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 5);

    const steps = [];
    for (const clause of clauses) {
      const step = this._parseSingleClause(clause);
      if (step) steps.push(step);
    }

    // If only partial clauses matched and utterance wasn't clearly actionable, let LLM handle purely conversational prompts
    if (steps.length === 0) return { matched: false, steps: [] };
    return { matched: true, steps };
  }

  _parseSingleClause(clause) {
    const text = String(clause || '').trim();
    const lower = text.toLowerCase();
    if (!text) return null;

    // YouTube Play inside chained clause
    const ytPlay =
      text.match(/^(?:go\s+(?:to|on)\s+)?(?:youtube|yt)(?:\s+and)?\s+(?:play|bajao|chalao)\s+(.+)$/i) ||
      text.match(/^(?:play|bajao|chalao)\s+(.+?)\s+(?:on|in)\s+(?:youtube|yt)$/i);
    if (ytPlay) return { type: 'youtube_play', query: ytPlay[1].trim() };

    // Create folder / project directory
    const folderMatch = text.match(/^(?:make|create|build|banao)\s+(?:a\s+)?(?:new\s+)?(?:(\w+)\s+)?(?:folder|directory|project)(?:\s+(?:called|named|by\s+name))?\s+(.+?)(?:\s+(?:on|in|inside)\s+(desktop|downloads|documents|projects|home))?$/i);
    if (folderMatch) {
      const scaffold = (folderMatch[1] || '').trim();
      let name = folderMatch[2].trim();
      let baseDir = folderMatch[3] ? folderMatch[3].toLowerCase() : 'desktop';
      const trailingLoc = name.match(/^(.+?)\s+(?:on|in|inside)\s+(desktop|downloads|documents|projects|home)$/i);
      if (trailingLoc) {
        name = trailingLoc[1].trim();
        baseDir = trailingLoc[2].toLowerCase();
      }
      return { type: 'create_folder', name: name.replace(/['"]/g, ''), baseDir, scaffold };
    }

    // Safe delete to Recycle Bin
    const delMatch = text.match(/^(?:delete|remove|trash|hatao|mita\s*do)\s+(?:the\s+)?(?:file|folder|directory|item)?\s*(.+?)(?:\s+(?:from|in|on)\s+(desktop|downloads|documents|projects|home))?$/i);
    if (delMatch && delMatch[1].trim()) {
      let targetName = delMatch[1].replace(/['"]/g, '').trim();
      let baseDir = delMatch[2] ? delMatch[2].toLowerCase() : '';
      const trailing = targetName.match(/^(.+?)\s+(?:from|in|on)\s+(desktop|downloads|documents|projects|home)$/i);
      if (trailing) {
        targetName = trailing[1].trim();
        baseDir = trailing[2].toLowerCase();
      }
      return { type: 'delete_recycle', targetName, baseDir };
    }

    // Download file / clone repo / winget install software
    const dlMatch = text.match(/^(?:download|install|clone|get|fetch)\s+(.+)$/i);
    if (dlMatch && dlMatch[1].trim()) {
      const arg = dlMatch[1].trim();
      if (/^https?:\/\//i.test(arg)) return { type: 'download_item', url: arg, target: '' };
      return { type: 'download_item', target: arg, url: '' };
    }

    // Screenshot
    if (/\b(?:take\s+a?\s*screenshot|screenshot|screen\s*capture)\b/i.test(lower)) {
      return { type: 'screenshot' };
    }

    // Volume control
    if (/\b(?:volume\s+up|increase\s+volume|louder|awaaz\s+badhao)\b/i.test(lower)) {
      return { type: 'volume', action: 'up', steps: 4 };
    }
    if (/\b(?:volume\s+down|decrease\s+volume|lower\s+volume|quieter|awaaz\s+kam)\b/i.test(lower)) {
      return { type: 'volume', action: 'down', steps: 4 };
    }
    if (/^(?:mute|unmute|mute\s+audio|mute\s+volume)$/i.test(lower)) {
      return { type: 'volume', action: 'mute', steps: 1 };
    }

    // Close app window
    const closeMatch = text.match(/^close\s+([a-zA-Z0-9._ -]{2,32})$/i);
    if (closeMatch) {
      return { type: 'close_app', target: closeMatch[1].trim() };
    }

    // Media playback control
    if (/\b(play|pause|resume|stop)\b.*\b(music|song|track|gaana|audio|spotify)\b|\b(music|gaana)\b.*\b(play|pause|band|chalu|roko)\b|^(?:play|pause)$/i.test(lower)) {
      return { type: 'media', command: 'playPause' };
    }
    if (/\b(next|skip|agla)\b.*\b(song|track|music|gaana)?\b/i.test(lower) && wordsCount(lower) <= 4) {
      return { type: 'media', command: 'next' };
    }
    if (/\b(prev|previous|pichla)\b.*\b(song|track|music|gaana)?\b/i.test(lower) && wordsCount(lower) <= 4) {
      return { type: 'media', command: 'prev' };
    }

    // Dance Mode
    if (/\b(dance)\b.*\b(off|stop|band)\b/i.test(lower)) return { type: 'dance_toggle', enable: false };
    if (/\b(dance|headphones|groove|naacho)\b.*\b(on|mode|karo|start)?\b/i.test(lower)) return { type: 'dance_toggle', enable: true };

    // Connectivity toggles
    const wifiM = lower.match(/^(?:turn\s+)?(on|off|enable|disable)\s+wi-?fi$/i) || lower.match(/^wi-?fi\s+(on|off|enable|disable|chalu|band)$/i);
    if (wifiM) return { type: 'wifi', enable: /^(on|enable|chalu)$/i.test(wifiM[1]) };
    const btM = lower.match(/^(?:turn\s+)?(on|off|enable|disable)\s+(?:bluetooth|bt)$/i) || lower.match(/^(?:bluetooth|bt)\s+(on|off|enable|disable|chalu|band)$/i);
    if (btM) return { type: 'bluetooth', enable: /^(on|enable|chalu)$/i.test(btM[1]) };

    // Reminder / Task / Timer
    const remM = text.match(/^(?:remind\s+me|reminder|yaad\s+dilana)\s+(?:in\s+(\d+)\s*(?:m|min|mins|minute|minutes)\s+)?(?:to\s+)?(.+)$/i);
    if (remM) return { type: 'add_reminder', minutes: Number(remM[1] || 10), text: remM[2].trim() };

    const taskM = text.match(/^(?:add\s+(?:a\s+)?task|task|todo)\s+(?:to\s+)?(.+)$/i);
    if (taskM) return { type: 'add_task', text: taskM[1].trim() };

    const timerM = text.match(/^(?:start\s+(?:a\s+)?)?(\d+)\s*(?:m|min|mins|minute|minutes)\s*(?:timer|sprint|focus)?$/i);
    if (timerM) return { type: 'start_timer', minutes: Number(timerM[1]), label: 'JARVIS Focus Sprint' };

    // Switch Robot Character
    const charM = lower.match(/^(?:switch\s+to\s+|activate\s+)?(kronos|aegis|optix|orbit)(?:\s+robot)?$/i);
    if (charM) return { type: 'pet_char', character: charM[1].toLowerCase() };

    // Agent Status report
    if (/\b(what\s+agent|which\s+agent|agent\s+status|announce\s+agent|antigravity\s+status)\b/i.test(lower)) {
      return { type: 'announce_agent' };
    }

    // Web Search
    const searchM = text.match(/^(?:search(?:\s+for|\s+web)?|google|brave\s+search)\s+(.+)$/i);
    if (searchM && searchM[1].trim()) {
      return { type: 'search_web', query: searchM[1].trim() };
    }

    // Open App / Website
    const openM = text.match(/^(?:open|launch|start|go\s+to|go\s+on|visit|kholo|chalao)\s+(.+)$/i);
    if (openM && openM[1].trim()) {
      const target = openM[1].replace(/\b(?:app|application|website|please)\b/gi, '').trim();
      if (target) return { type: 'open_app', target };
    }

    return null;
  }

  async executeStep(step, opts = {}) {
    if (!step || !step.type) return { ok: false, summary: 'Invalid step' };
    switch (step.type) {
      case 'ide_project_prompt':
        return this.openIdeProjectAndPrompt(step);
      case 'youtube_play':
        return this.playYouTubeDirect(step.query);
      case 'create_folder':
        return this.createFolder(step, opts);
      case 'create_file':
        return this.createFile(step);
      case 'delete_recycle':
        return this.deleteToRecycleBin(step);
      case 'download_item':
        return this.downloadItem(step);
      case 'screenshot':
        return this.takeScreenshot();
      case 'volume':
        return this.setVolume(step.action, step.steps);
      case 'close_app':
        return this.closeApp(step.target);
      case 'open_app': {
        const r = await this.launchAllowlistedApp(step.target, { asApp: Boolean(step.asApp) });
        return { ok: Boolean(r?.ok), summary: r?.ok ? `Opened ${r.label || step.target}` : (r?.error || `Could not open ${step.target}`) };
      }
      case 'open_url': {
        const r = await this.openInBrave(step.url, { asApp: Boolean(step.asApp) });
        return { ok: Boolean(r?.ok), summary: r?.ok ? `Opened ${step.url}` : (r?.error || 'Blocked URL') };
      }
      case 'search_web':
        await this.searchInBrave('web', step.query);
        return { ok: true, summary: `Searched Brave for "${step.query}"` };
      case 'media':
        if (this.musicDetector) await this.musicDetector.sendMediaKey(step.command || 'playPause');
        return { ok: true, summary: `Media: ${step.command || 'playPause'}` };
      case 'dance_toggle':
        this.toggleDanceMode(Boolean(step.enable));
        return { ok: true, summary: step.enable ? 'Dance Mode ON' : 'Dance Mode OFF' };
      case 'wifi':
        if (this.systemControls) return this.systemControls.setRadioState('WiFi', Boolean(step.enable));
        return { ok: false, summary: 'System controls unavailable' };
      case 'bluetooth':
        if (this.systemControls) return this.systemControls.setRadioState('Bluetooth', Boolean(step.enable));
        return { ok: false, summary: 'System controls unavailable' };
      case 'add_reminder':
        if (this.autoPilot) this.autoPilot.addReminder(step.text, step.minutes || 10);
        return { ok: true, summary: `Reminder set (${step.minutes || 10}m): "${step.text}"` };
      case 'add_task':
        if (this.autoPilot) this.autoPilot.addTask(step.text);
        return { ok: true, summary: `Task added: "${step.text}"` };
      case 'start_timer':
        if (this.autoPilot) this.autoPilot.startTimer(step.minutes || 25, step.label || 'Focus Sprint');
        return { ok: true, summary: `Started ${step.minutes || 25}m timer` };
      case 'pet_char':
        this.setPetCharacter(step.character);
        return { ok: true, summary: `Switched robot to ${step.character}` };
      case 'pet_mode':
        this.setPetMode(step.mode);
        return { ok: true, summary: `Robot mode -> ${step.mode}` };
      case 'announce_agent': {
        const r = await this.announceActiveAgent('', true);
        return { ok: true, summary: r?.message || 'Announced active coding agent.' };
      }
      default:
        return { ok: false, summary: `Unknown step type: ${step.type}` };
    }
  }

  async executePlan(steps = [], onStepProgress = null, opts = {}) {
    const queue = Array.isArray(steps) ? steps.slice(0, 5) : [];
    const results = [];
    for (let i = 0; i < queue.length; i++) {
      const step = queue[i];
      if (typeof onStepProgress === 'function') {
        try { onStepProgress({ index: i, total: queue.length, step, status: 'running', summary: `Executing ${step.type}...` }); } catch {}
      }
      this.triggerPetReaction('task');
      const res = await this.executeStep(step, opts);
      results.push({ step: step.type, ...res });
      this.writeLog('INFO', `JARVIS step [${i + 1}/${queue.length}] ${step.type}: ${res.summary}`);
      if (typeof onStepProgress === 'function') {
        try { onStepProgress({ index: i, total: queue.length, step, status: res.ok ? 'done' : 'failed', summary: res.summary }); } catch {}
      }
    }
    const okAny = results.some((r) => r.ok);
    const summaryReply = results.map((r) => r.summary).filter(Boolean).join(' · ') || 'Done, bro.';
    this.triggerPetReaction(okAny ? 'allow' : 'speak');
    return { ok: okAny, results, summaryReply };
  }
}

function wordsCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

module.exports = {
  JarvisAgent,
  isProtectedPath,
  extractFirstYouTubeVideoId,
  normalizeProjectName,
  WINGET_PACKAGES,
};
