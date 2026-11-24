const { execFile } = require('child_process');
const os = require('os');

/**
 * Lightweight on-demand System Pulse for AI engineers & vibe coders:
 *  - Active browsers & coding apps with exact window/tab titles (e.g. "Chrome: GitHub PRs")
 *  - Listening localhost dev ports (3000, 5173, 8080, 47821, etc.)
 *  - Current system RAM usage %
 * Runs ONLY when HUD is open (zero idle background CPU/RAM overhead!).
 */
function getActiveDesktopWindows() {
  return new Promise((resolve) => {
    const ps = `
      $items = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and
        $_.ProcessName -match '^(brave|chrome|msedge|firefox|arc|Spotify|Antigravity|Code|Cursor|Windsurf|WhatsApp|WindowsTerminal|Notion|Slack|Discord)$'
      } | Select-Object -First 8 ProcessName, MainWindowTitle
      if ($items) { $items | ConvertTo-Json -Compress } else { '[]' }
    `;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 3000, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const labelMap = {
            brave: { label: 'Brave', kind: 'browser' },
            spotify: { label: 'Spotify', kind: 'music' },
            chrome: { label: 'Chrome', kind: 'browser' },
            msedge: { label: 'Edge', kind: 'browser' },
            firefox: { label: 'Firefox', kind: 'browser' },
            arc: { label: 'Arc', kind: 'browser' },
            antigravity: { label: 'Antigravity', kind: 'ide' },
            code: { label: 'VS Code', kind: 'ide' },
            cursor: { label: 'Cursor', kind: 'ide' },
            windsurf: { label: 'Windsurf', kind: 'ide' },
            whatsapp: { label: 'WhatsApp', kind: 'chat' },
            windowsterminal: { label: 'Terminal', kind: 'terminal' },
            notion: { label: 'Notion', kind: 'docs' },
            slack: { label: 'Slack', kind: 'chat' },
            discord: { label: 'Discord', kind: 'chat' },
          };
          resolve(
            arr.map((x) => {
              const key = String(x.ProcessName || '').toLowerCase();
              const meta = labelMap[key] || { label: x.ProcessName, kind: 'app' };
              const cleanTitle = String(x.MainWindowTitle || '')
                .replace(/\s*[-—]\s*(Google Chrome|Microsoft Edge|Brave|Mozilla Firefox|Visual Studio Code)$/i, '')
                .trim()
                .slice(0, 72);
              return {
                processName: x.ProcessName,
                app: meta.label,
                kind: meta.kind,
                title: cleanTitle || meta.label,
              };
            })
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function getListeningDevPorts() {
  return new Promise((resolve) => {
    execFile(
      'netstat.exe',
      ['-ano', '-p', 'TCP'],
      { windowsHide: true, timeout: 2500, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const seen = new Set();
        const ports = [];
        const commonNames = {
          3000: 'Next / React',
          3001: 'Dev Server',
          4000: 'API / GraphQL',
          4200: 'Angular',
          5000: 'Flask / API',
          5173: 'Vite Dev',
          5174: 'Vite Dev',
          5432: 'PostgreSQL',
          6379: 'Redis',
          8000: 'FastAPI / Py',
          8080: 'Local Web',
          8787: 'Wrangler',
          27017: 'MongoDB',
          47821: 'PetFish Hook',
        };
        for (const line of stdout.split(/\r?\n/)) {
          if (!line.includes('LISTENING')) continue;
          const m = line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
          if (!m) continue;
          const port = Number(m[1]);
          const pid = Number(m[2]);
          if (port < 1024 || seen.has(port)) continue;
          // Show common developer ports + user range (< 50000)
          if (commonNames[port] || (port >= 3000 && port <= 9999) || port === 47821) {
            seen.add(port);
            ports.push({
              port,
              pid,
              label: commonNames[port] || 'Local Service',
              url: `http://127.0.0.1:${port}`,
            });
          }
        }
        ports.sort((a, b) => a.port - b.port);
        resolve(ports.slice(0, 10));
      }
    );
  });
}

function getSystemVitals(appMetrics = []) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
  // Use privateBytes (actual unique RAM, avoiding double-counting shared Electron DLL pages)
  const appRamMB = Math.round(
    appMetrics.reduce((sum, m) => sum + (((m.memory?.privateBytes || m.memory?.workingSetSize || 0)) / 1024), 0)
  );
  return {
    sysRamPct: usedPct,
    appRamMB,
    processCount: appMetrics.length,
  };
}

module.exports = { getActiveDesktopWindows, getListeningDevPorts, getSystemVitals };
