const { execFile } = require('child_process');
const EventEmitter = require('events');

const MUSIC_PS = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(2800) | Out-Null
  $netTask.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
try {
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $sessions = $mgr.GetSessions()
  $chosen = $null
  foreach ($s in $sessions) {
    $pb = $s.GetPlaybackInfo()
    if ($pb -and $pb.PlaybackStatus.ToString() -eq 'Playing') { $chosen = $s; break }
  }
  if (-not $chosen) { $chosen = $mgr.GetCurrentSession() }
  if ($chosen) {
    $pb = $chosen.GetPlaybackInfo()
    $st = if ($pb) { $pb.PlaybackStatus.ToString() } else { 'Stopped' }
    $props = $null
    try { $props = Await ($chosen.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}
    [PSCustomObject]@{
      isPlaying = ($st -eq 'Playing')
      status = $st
      app = [string]$chosen.SourceAppUserModelId
      title = if ($props) { [string]$props.Title } else { '' }
      artist = if ($props) { [string]$props.Artist } else { '' }
    } | ConvertTo-Json -Compress
  } else {
    '{"isPlaying":false,"status":"None","app":"","title":"","artist":""}'
  }
} catch {
  '{"isPlaying":false,"status":"Error","app":"","title":"","artist":""}'
}
`;

function prettifyMediaApp(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('brave')) return 'Brave';
  if (s.includes('chrome')) return 'Chrome';
  if (s.includes('edge')) return 'Edge';
  if (s.includes('vlc')) return 'VLC';
  if (s.includes('zunemusic') || s.includes('mediaplayer')) return 'Media Player';
  if (s.includes('applemusic')) return 'Apple Music';
  return raw ? String(raw).split(/[!\\/.]/)[0].slice(0, 18) : 'Media';
}

class MusicDetector extends EventEmitter {
  constructor() {
    super();
    this.state = {
      isPlaying: false,
      status: 'None',
      source: '',
      title: '',
      artist: '',
      updatedAt: 0,
    };
    this.timer = null;
    this.polling = false;
  }

  getState() {
    return this.state;
  }

  start() {
    this.poll();
    if (this.timer) clearInterval(this.timer);
    // Lightweight 5.5s interval -> exits cleanly after each check so 0 MB stays resident!
    this.timer = setInterval(() => this.poll(), 5500);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  sendMediaKey(action) {
    const vkMap = { playPause: 0xb3, next: 0xb0, prev: 0xb1 };
    const vk = vkMap[action];
    if (!vk) return Promise.resolve({ ok: false });
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AuraMediaKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[AuraMediaKey]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero)
[AuraMediaKey]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)
Write-Output "OK"
`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { windowsHide: true, timeout: 3000 },
        (err) => {
          setTimeout(() => this.poll(), 450);
          resolve({ ok: !err });
        }
      );
    });
  }

  poll() {
    if (this.polling) return Promise.resolve(this.state);
    this.polling = true;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', MUSIC_PS],
        { windowsHide: true, timeout: 4200 },
        (err, stdout) => {
          this.polling = false;
          if (!err && stdout) {
            try {
              const d = JSON.parse(stdout.trim());
              const next = {
                isPlaying: Boolean(d.isPlaying),
                status: String(d.status || 'None'),
                source: prettifyMediaApp(d.app),
                title: String(d.title || '').trim().slice(0, 80),
                artist: String(d.artist || '').trim().slice(0, 60),
                updatedAt: Date.now(),
              };
              const changed =
                next.isPlaying !== this.state.isPlaying ||
                next.title !== this.state.title ||
                next.artist !== this.state.artist;
              this.state = next;
              if (changed) this.emit('update', this.state);
            } catch {}
          }
          resolve(this.state);
        }
      );
    });
  }
}

module.exports = { MusicDetector };
