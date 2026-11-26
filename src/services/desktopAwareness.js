const { execFile, spawn } = require('child_process');
const { sanitizeProcessHint } = require('./security');

const DESKTOP_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'NotifyIconOverflowWindow',
  '',
]);

class DesktopWatcher {
  constructor() {
    this.proc = null;
    this.pending = [];
    this.buffer = '';
  }

  ensureStarted() {
    if (this.proc && !this.proc.killed) return;

    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PetFishWinCheck {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
}
"@
[Console]::Out.AutoFlush = $true
$sb = New-Object System.Text.StringBuilder 256
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line -eq 'EXIT') { break }
  $sb.Length = 0
  $h = [PetFishWinCheck]::GetForegroundWindow()
  [void][PetFishWinCheck]::GetClassName($h, $sb, $sb.Capacity)
  $pidOut = 0
  [void][PetFishWinCheck]::GetWindowThreadProcessId($h, [ref]$pidOut)
  $zoomed = [PetFishWinCheck]::IsZoomed($h)
  [Console]::Out.WriteLine("$($sb.ToString())|$pidOut|$zoomed")
}
`;
    this.proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    );

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        const resolve = this.pending.shift();
        if (resolve) resolve(line);
      }
    });

    this.proc.on('exit', () => {
      this.proc = null;
      while (this.pending.length > 0) {
        const resolve = this.pending.shift();
        resolve('');
      }
    });
  }

  check(ownPid) {
    this.ensureStarted();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ onDesktop: true, className: '', zoomed: false }), 1500);
      this.pending.push((line) => {
        clearTimeout(timer);
        if (!line) return resolve({ onDesktop: true, className: '', zoomed: false });
        const [className = '', pidStr = '0', zoomedStr = 'False'] = line.split('|');
        const fgPid = Number(pidStr);
        const onDesktop = DESKTOP_CLASSES.has(className) || fgPid === Number(ownPid);
        resolve({ onDesktop, className, fgPid, zoomed: zoomedStr === 'True' });
      });

      try {
        this.proc.stdin.write('CHECK\n');
      } catch {
        clearTimeout(timer);
        resolve({ onDesktop: true, className: '', zoomed: false });
      }
    });
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.stdin.write('EXIT\n');
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
  }
}

const sharedWatcher = new DesktopWatcher();

function checkIsOnDesktop(ownPid) {
  return sharedWatcher.check(ownPid);
}

function stopDesktopWatcher() {
  sharedWatcher.stop();
}

/**
 * Injection-safe app focus helper: passes target hint strictly via environment variable
 * (never interpolated into PowerShell script code).
 */
function focusAppWindow(processHint, opts = {}) {
  return new Promise((resolve) => {
    const safeHint = sanitizeProcessHint(processHint);
    if (!safeHint) return resolve(false);
    const strictProcess = Boolean(opts.strictProcess);

    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PetFishFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
$hint = $env:PETFISH_FOCUS_HINT
$strict = ($env:PETFISH_FOCUS_STRICT -eq '1')
$browsers = @('brave','chrome','msedge','firefox','opera')
$hintIsBrowser = ($browsers -contains $hint.ToLower())
$targets = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  if ($_.MainWindowHandle -eq 0) { return $false }
  $pn = $_.ProcessName
  if ($strict) { return ($pn -ieq $hint) }
  if (-not $hintIsBrowser -and ($browsers -contains $pn.ToLower())) { return $false }
  return ($pn -like "*$hint*" -or $_.MainWindowTitle -like "*$hint*")
}
if (-not $targets -and -not $strict -and $hint -match "claude") {
  $targets = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match "WindowsTerminal|powershell|pwsh|cmd|Code|Cursor|Antigravity")
  }
}
$first = $targets | Select-Object -First 1
if ($first) {
  $h = $first.MainWindowHandle
  if ([PetFishFocus]::IsIconic($h)) { [void][PetFishFocus]::ShowWindowAsync($h, 9) }
  [void][PetFishFocus]::SetForegroundWindow($h)
  "OK"
} else {
  "NONE"
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      {
        windowsHide: true,
        timeout: 3500,
        env: {
          ...process.env,
          PETFISH_FOCUS_HINT: safeHint,
          PETFISH_FOCUS_STRICT: strictProcess ? '1' : '0',
        },
      },
      (err, stdout) => {
        resolve(!err && String(stdout).trim() === 'OK');
      }
    );
  });
}

let chordProc = null;

/**
 * Unified Global Key-Chord Watcher:
 * - A (0x41) + S (0x53) + D (0x44) -> Fires 'ASD_JARVIS_VOICE' (activates JARVIS Local Whisper Voice OS!)
 */
function startAsdChordWatcher(onTrigger) {
  if (chordProc && !chordProc.killed) return;
  const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AuraKeyChord {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
[Console]::Out.AutoFlush = $true
$heldAsd = 0
$cool = 0
while ($true) {
  Start-Sleep -Milliseconds 45
  if ($cool -gt 0) { $cool--; continue }
  $a = ([AuraKeyChord]::GetAsyncKeyState(0x41) -band 0x8000) -ne 0
  $s = ([AuraKeyChord]::GetAsyncKeyState(0x53) -band 0x8000) -ne 0
  $d = ([AuraKeyChord]::GetAsyncKeyState(0x44) -band 0x8000) -ne 0
  if ($a -and $s -and $d) {
    $heldAsd++
    if ($heldAsd -ge 2) {
      [Console]::Out.WriteLine("ASD_JARVIS_VOICE")
      $heldAsd = 0
      $cool = 36
    }
  } else {
    $heldAsd = 0
  }
}
`;
  try {
    chordProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    chordProc.stdout.setEncoding('utf8');
    chordProc.stdout.on('data', (chunk) => {
      const s = String(chunk);
      if (s.includes('ASD_JARVIS_VOICE') || s.includes('ASD_WAKE')) {
        try { onTrigger('ASD_JARVIS_VOICE'); } catch {}
      }
    });
    chordProc.on('exit', () => { chordProc = null; });
  } catch {
    chordProc = null;
  }
}

function stopAsdChordWatcher() {
  if (chordProc) {
    try { chordProc.kill(); } catch {}
    chordProc = null;
  }
}

module.exports = {
  checkIsOnDesktop,
  stopDesktopWatcher,
  focusAppWindow,
  startAsdChordWatcher,
  stopAsdChordWatcher,
};
