const { execFile, spawn } = require('child_process');
const { writeLog } = require('./security');

const SAFE_SETTINGS_URIS = new Set([
  'ms-settings:',
  'ms-settings:network-wifi',
  'ms-settings:bluetooth',
  'ms-settings:network-airplanemode',
  'ms-settings:sound',
  'ms-settings:display',
  'ms-availablenetworks:',
  'ms-actioncenter:controlcenter/bluetooth',
]);

function runExecFile(bin, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { windowsHide: true, timeout: opts.timeout || 5500, env: opts.env || process.env },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: err ? err.message : null,
        });
      }
    );
  });
}

function runPowerShell(script, extraEnv = {}, timeout = 6500) {
  return runExecFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout, env: { ...process.env, ...extraEnv } }
  );
}

const WINRT_AWAIT_PREAMBLE = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(4500) | Out-Null
  $netTask.Result
}
[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
`;

class SystemControls {
  constructor() {
    this.cachedState = {
      wifiOn: true,
      bluetoothOn: true,
      flightMode: false,
      connectedSsid: '',
      signalPct: 0,
      band: '',
      wifiNetworks: [], // { ssid, saved, connected, signal }
      bluetoothDevices: [], // { name, mac, connected, status }
      updatedAt: 0,
    };
    this.preFlightRadios = { wifi: true, bluetooth: true };
    this.refreshInFlight = null;
  }

  getCachedState() {
    return this.cachedState;
  }

  async parseNetshWifi() {
    const [ifaceRes, profRes, netRes] = await Promise.all([
      runExecFile('netsh', ['wlan', 'show', 'interfaces'], { timeout: 3000 }),
      runExecFile('netsh', ['wlan', 'show', 'profiles'], { timeout: 3000 }),
      runExecFile('netsh', ['wlan', 'show', 'networks', 'mode=bssid'], { timeout: 3500 }),
    ]);

    let connectedSsid = '';
    let signalPct = 0;
    let band = '';
    let ifaceState = '';

    if (ifaceRes.ok) {
      const mState = ifaceRes.stdout.match(/^\s*State\s*:\s*(.+)$/im);
      ifaceState = mState ? mState[1].trim().toLowerCase() : '';
      if (ifaceState === 'connected') {
        const mSsid = ifaceRes.stdout.match(/^\s*SSID\s*:\s*(.+)$/im);
        const mSig = ifaceRes.stdout.match(/^\s*Signal\s*:\s*(\d+)%/im);
        const mBand = ifaceRes.stdout.match(/^\s*Band\s*:\s*(.+)$/im);
        connectedSsid = mSsid ? mSsid[1].trim() : '';
        signalPct = mSig ? Number(mSig[1]) : 0;
        band = mBand ? mBand[1].trim() : '';
      }
    }

    const savedSet = new Set();
    if (profRes.ok) {
      const lines = profRes.stdout.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/All User Profile\s*:\s*(.+)$/i);
        if (m && m[1].trim()) savedSet.add(m[1].trim());
      }
    }

    const visibleMap = new Map();
    if (netRes.ok) {
      let curSsid = '';
      for (const line of netRes.stdout.split(/\r?\n/)) {
        const mSsid = line.match(/^SSID\s+\d+\s*:\s*(.*)$/i);
        if (mSsid) {
          curSsid = mSsid[1].trim();
          if (curSsid && !visibleMap.has(curSsid)) visibleMap.set(curSsid, 0);
          continue;
        }
        const mSig = line.match(/Signal\s*:\s*(\d+)%/i);
        if (mSig && curSsid) {
          const val = Number(mSig[1]);
          if (val > (visibleMap.get(curSsid) || 0)) visibleMap.set(curSsid, val);
        }
      }
    }

    // Build sorted merged network list: connected first, then visible saved, then other saved, then nearby unsaved
    const allNames = new Set([...savedSet, ...visibleMap.keys()]);
    if (connectedSsid) allNames.add(connectedSsid);

    const networks = Array.from(allNames)
      .filter((s) => s && s.length > 0)
      .map((ssid) => ({
        ssid,
        saved: savedSet.has(ssid),
        connected: ssid === connectedSsid,
        nearby: visibleMap.has(ssid),
        signal: ssid === connectedSsid ? (signalPct || visibleMap.get(ssid) || 0) : (visibleMap.get(ssid) || 0),
      }))
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
        if (a.saved !== b.saved) return a.saved ? -1 : 1;
        return b.signal - a.signal;
      })
      .slice(0, 20);

    return { connectedSsid, signalPct, band, networks, ifaceState };
  }

  async readRadiosAndBluetooth() {
    const ps = `
${WINRT_AWAIT_PREAMBLE}
$wifi = $null
$bt = $null
try {
  $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
  foreach ($r in $radios) {
    if ($r.Kind.ToString() -eq 'WiFi') { $wifi = ($r.State.ToString() -eq 'On') }
    if ($r.Kind.ToString() -eq 'Bluetooth') { $bt = ($r.State.ToString() -eq 'On') }
  }
} catch {}
$aero = 0
try {
  $aero = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\RadioManagement\\SystemRadioState' -ErrorAction SilentlyContinue).'(default)'
  if ($null -eq $aero) { $aero = 0 }
} catch {}
$btDevs = @()
try {
  $pnp = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTHENUM\\\\DEV_([0-9A-F]{12})' }
  foreach ($d in $pnp) {
    if ($d.InstanceId -match 'DEV_([0-9A-F]{12})') { $mac = $Matches[1] } else { $mac = '' }
    $conn = $false
    try {
      $prop = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15' -ErrorAction SilentlyContinue
      if ($prop -and $prop.Data -eq $true) { $conn = $true }
    } catch {}
    $btDevs += [PSCustomObject]@{
      name = $d.FriendlyName
      mac = $mac
      connected = $conn
      status = [string]$d.Status
    }
  }
} catch {}
[PSCustomObject]@{
  wifiOn = $wifi
  bluetoothOn = $bt
  systemAero = [int]$aero
  bluetoothDevices = $btDevs
} | ConvertTo-Json -Compress -Depth 4
`;
    const res = await runPowerShell(ps, {}, 6500);
    if (!res.ok || !res.stdout.trim()) return null;
    try {
      const parsed = JSON.parse(res.stdout.trim());
      const devs = Array.isArray(parsed.bluetoothDevices)
        ? parsed.bluetoothDevices
        : parsed.bluetoothDevices
          ? [parsed.bluetoothDevices]
          : [];
      return {
        wifiOn: typeof parsed.wifiOn === 'boolean' ? parsed.wifiOn : null,
        bluetoothOn: typeof parsed.bluetoothOn === 'boolean' ? parsed.bluetoothOn : null,
        systemAero: Number(parsed.systemAero || 0),
        bluetoothDevices: devs
          .filter((d) => d && d.name && d.mac)
          .sort((a, b) => (a.connected === b.connected ? a.name.localeCompare(b.name) : a.connected ? -1 : 1))
          .slice(0, 20),
      };
    } catch {
      return null;
    }
  }

  async refresh(force = false) {
    if (!force && Date.now() - this.cachedState.updatedAt < 3000) {
      return this.cachedState;
    }
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const [wifi, radioData] = await Promise.all([
          this.parseNetshWifi(),
          this.readRadiosAndBluetooth(),
        ]);

        const wifiOn =
          radioData && typeof radioData.wifiOn === 'boolean'
            ? radioData.wifiOn
            : wifi.ifaceState === 'connected' || wifi.networks.some((n) => n.nearby);
        const bluetoothOn =
          radioData && typeof radioData.bluetoothOn === 'boolean'
            ? radioData.bluetoothOn
            : this.cachedState.bluetoothOn;
        const flightMode =
          (radioData && radioData.systemAero === 1) || (!wifiOn && !bluetoothOn);

        this.cachedState = {
          wifiOn,
          bluetoothOn,
          flightMode,
          connectedSsid: wifiOn ? wifi.connectedSsid : '',
          signalPct: wifiOn ? wifi.signalPct : 0,
          band: wifiOn ? wifi.band : '',
          wifiNetworks: wifi.networks,
          bluetoothDevices: radioData ? radioData.bluetoothDevices : this.cachedState.bluetoothDevices,
          updatedAt: Date.now(),
        };
      } catch (err) {
        writeLog('WARN', `SystemControls refresh error: ${err.message}`);
      } finally {
        this.refreshInFlight = null;
      }
      return this.cachedState;
    })();

    return this.refreshInFlight;
  }

  async setRadioState(kind, enable) {
    if (kind !== 'WiFi' && kind !== 'Bluetooth') {
      return { ok: false, error: 'Unsupported radio kind' };
    }
    const targetState = enable ? 'On' : 'Off';
    const ps = `
${WINRT_AWAIT_PREAMBLE}
$kind = $env:PETFISH_RADIO_KIND
$desired = $env:PETFISH_RADIO_STATE
$access = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$target = $radios | Where-Object { $_.Kind.ToString() -eq $kind } | Select-Object -First 1
if (-not $target) { Write-Output "NOT_FOUND"; exit 1 }
$stEnum = if ($desired -eq 'On') { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
$res = Await ($target.SetStateAsync($stEnum)) ([Windows.Devices.Radios.RadioAccessStatus])
Write-Output $res.ToString()
`;
    const res = await runPowerShell(ps, { PETFISH_RADIO_KIND: kind, PETFISH_RADIO_STATE: targetState }, 7000);
    const out = res.stdout.trim();
    const ok = res.ok && /Allowed/i.test(out);
    writeLog('INFO', `SystemControls setRadio ${kind}=${targetState} -> ${out || res.error}`);
    if (ok) {
      if (kind === 'WiFi') this.cachedState.wifiOn = Boolean(enable);
      if (kind === 'Bluetooth') this.cachedState.bluetoothOn = Boolean(enable);
      this.cachedState.flightMode = !this.cachedState.wifiOn && !this.cachedState.bluetoothOn;
    }
    await new Promise((r) => setTimeout(r, 900));
    await this.refresh(true);
    if (ok) {
      if (kind === 'WiFi') this.cachedState.wifiOn = Boolean(enable);
      if (kind === 'Bluetooth') this.cachedState.bluetoothOn = Boolean(enable);
      this.cachedState.flightMode = !this.cachedState.wifiOn && !this.cachedState.bluetoothOn;
    }
    return {
      ok,
      message: ok ? `${kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} turned ${targetState}` : `Could not change ${kind} (${out || 'denied'})`,
      state: this.cachedState,
    };
  }

  async setFlightMode(enable) {
    const turnOn = Boolean(enable);
    if (turnOn) {
      this.preFlightRadios = {
        wifi: this.cachedState.wifiOn,
        bluetooth: this.cachedState.bluetoothOn,
      };
    }

    const ps = `
${WINRT_AWAIT_PREAMBLE}
$mode = $env:PETFISH_FLIGHT_ENABLE
$restoreWifi = $env:PETFISH_RESTORE_WIFI
$restoreBt = $env:PETFISH_RESTORE_BT
$access = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$changed = 0
foreach ($r in $radios) {
  $k = $r.Kind.ToString()
  if ($mode -eq '1') {
    $null = Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]::Off)) ([Windows.Devices.Radios.RadioAccessStatus])
    $changed++
  } else {
    if ($k -eq 'WiFi' -and $restoreWifi -eq '1') {
      $null = Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]::On)) ([Windows.Devices.Radios.RadioAccessStatus])
      $changed++
    } elseif ($k -eq 'Bluetooth' -and $restoreBt -eq '1') {
      $null = Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]::On)) ([Windows.Devices.Radios.RadioAccessStatus])
      $changed++
    }
  }
}
Write-Output "OK:$changed"
`;
    const restoreWifi = !this.preFlightRadios.wifi && !this.preFlightRadios.bluetooth ? '1' : this.preFlightRadios.wifi ? '1' : '0';
    const restoreBt = this.preFlightRadios.bluetooth ? '1' : '0';

    const res = await runPowerShell(
      ps,
      {
        PETFISH_FLIGHT_ENABLE: turnOn ? '1' : '0',
        PETFISH_RESTORE_WIFI: restoreWifi,
        PETFISH_RESTORE_BT: restoreBt,
      },
      8000
    );
    const ok = res.ok && /^OK:/i.test(res.stdout.trim());
    writeLog('INFO', `SystemControls FlightMode=${turnOn ? 'ON' : 'OFF'} -> ${res.stdout.trim() || res.error}`);
    if (ok) {
      this.cachedState.flightMode = turnOn;
      this.cachedState.wifiOn = turnOn ? false : restoreWifi === '1';
      this.cachedState.bluetoothOn = turnOn ? false : restoreBt === '1';
    }
    await new Promise((r) => setTimeout(r, 900));
    await this.refresh(true);
    if (ok) {
      this.cachedState.flightMode = turnOn;
    }
    return {
      ok,
      message: ok ? (turnOn ? 'Flight Mode ON (All radios off)' : 'Flight Mode OFF (Radios restored)') : 'Could not toggle Flight Mode',
      state: this.cachedState,
    };
  }

  async connectWifi(ssid) {
    const cleanSsid = String(ssid || '').replace(/[\x00-\x1f\r\n\0"'`$|&;<> =/\\]/g, (ch) => (ch === ' ' ? ' ' : '')).trim().slice(0, 64);
    if (!cleanSsid || /^[-/]/.test(cleanSsid)) return { ok: false, message: 'Invalid Wi-Fi name provided', state: this.cachedState };

    // Ensure Wi-Fi radio is ON first
    if (!this.cachedState.wifiOn) {
      await this.setRadioState('WiFi', true);
    }

    // Match saved profile case-insensitively if possible
    const match = this.cachedState.wifiNetworks.find(
      (n) => n.ssid.toLowerCase() === cleanSsid.toLowerCase()
    );
    const targetName = match ? match.ssid : cleanSsid;

    // If it's a known unsaved network, open Windows Available Networks picker so user can enter password
    if (match && !match.saved) {
      this.openSettingsUri('ms-availablenetworks:');
      return {
        ok: true,
        openedPanel: true,
        message: `Opened Windows Wi-Fi panel to enter password for "${targetName}"`,
        state: this.cachedState,
      };
    }

    const res = await runExecFile('netsh', ['wlan', 'connect', `name=${targetName}`], { timeout: 5000 });
    const out = `${res.stdout} ${res.stderr}`.trim();
    const ok = res.ok && /completed successfully/i.test(out);
    writeLog('INFO', `SystemControls connectWifi("${targetName}") -> ok=${ok}`);

    if (!ok) {
      this.openSettingsUri('ms-availablenetworks:');
    }
    await new Promise((r) => setTimeout(r, 900));
    await this.refresh(true);
    return {
      ok,
      message: ok ? `Connecting to Wi-Fi "${targetName}"...` : `Profile not saved — opened Wi-Fi panel for "${targetName}"`,
      state: this.cachedState,
    };
  }

  async disconnectWifi() {
    const res = await runExecFile('netsh', ['wlan', 'disconnect'], { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 500));
    await this.refresh(true);
    return {
      ok: res.ok,
      message: res.ok ? 'Disconnected from Wi-Fi' : 'Could not disconnect Wi-Fi',
      state: this.cachedState,
    };
  }

  /**
   * Connects or disconnects a paired Bluetooth audio/peripheral device via native Windows BluetoothAPIs.dll,
   * and gracefully opens Windows Bluetooth panel if manual pairing/confirmation is needed.
   */
  async connectBluetoothDevice(macOrName, connect = true) {
    if (!this.cachedState.bluetoothOn && connect) {
      await this.setRadioState('Bluetooth', true);
    }
    if (this.cachedState.bluetoothDevices.length === 0) {
      await this.refresh(true);
    }

    const raw = String(macOrName || '').trim();
    const matched =
      this.cachedState.bluetoothDevices.find((d) => d.mac.toLowerCase() === raw.toLowerCase()) ||
      this.cachedState.bluetoothDevices.find((d) => d.name.toLowerCase().includes(raw.toLowerCase()));

    if (!matched || !/^[0-9A-Fa-f]{12}$/.test(matched.mac)) {
      this.openSettingsUri('ms-settings:bluetooth');
      return {
        ok: true,
        openedPanel: true,
        message: 'Opened Windows Bluetooth panel to connect device',
        state: this.cachedState,
      };
    }

    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PetFishBT {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct BLUETOOTH_DEVICE_INFO {
    public uint dwSize;
    public ulong Address;
    public uint ulClassofDevice;
    public int fConnected;
    public int fRemembered;
    public int fAuthenticated;
    public SYSTEMTIME stLastSeen;
    public SYSTEMTIME stLastUsed;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)]
    public string szName;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct SYSTEMTIME {
    public ushort wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds;
  }
  [DllImport("BluetoothAPIs.dll", SetLastError = true)]
  public static extern uint BluetoothSetServiceState(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO pbtdi, ref Guid pGuidService, uint dwServiceFlags);
  public static int ToggleAudio(ulong addr, bool enable) {
    var info = new BLUETOOTH_DEVICE_INFO();
    info.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
    info.Address = addr;
    Guid a2dp = new Guid("0000110b-0000-1000-8000-00805f9b34fb");
    Guid hfp  = new Guid("0000111e-0000-1000-8000-00805f9b34fb");
    Guid hsp  = new Guid("00001108-0000-1000-8000-00805f9b34fb");
    Guid hid  = new Guid("00001124-0000-1000-8000-00805f9b34fb");
    uint flag = enable ? 1u : 0u;
    uint r1 = BluetoothSetServiceState(IntPtr.Zero, ref info, ref a2dp, flag);
    uint r2 = BluetoothSetServiceState(IntPtr.Zero, ref info, ref hfp, flag);
    uint r3 = BluetoothSetServiceState(IntPtr.Zero, ref info, ref hsp, flag);
    uint r4 = BluetoothSetServiceState(IntPtr.Zero, ref info, ref hid, flag);
    return (r1 == 0 || r2 == 0 || r3 == 0 || r4 == 0) ? 0 : (int)r1;
  }
}
"@
$addr = [Convert]::ToUInt64($env:PETFISH_BT_MAC, 16)
$en = ($env:PETFISH_BT_CONNECT -eq '1')
$rc = [PetFishBT]::ToggleAudio($addr, $en)
Write-Output "RC:$rc"
`;
    const res = await runPowerShell(
      ps,
      { PETFISH_BT_MAC: matched.mac, PETFISH_BT_CONNECT: connect ? '1' : '0' },
      7000
    );
    const ok = res.ok && /RC:0/.test(res.stdout);
    writeLog('INFO', `SystemControls BT ${connect ? 'connect' : 'disconnect'} "${matched.name}" -> ${res.stdout.trim() || res.error}`);

    if (!ok) {
      // Open native Bluetooth settings so Windows can initiate pairing/audio handoff cleanly
      this.openSettingsUri('ms-settings:bluetooth');
    }

    await new Promise((r) => setTimeout(r, 900));
    await this.refresh(true);
    return {
      ok: true,
      direct: ok,
      message: ok
        ? `${connect ? 'Connected' : 'Disconnected'} ${matched.name}`
        : `Opened Bluetooth panel for ${matched.name}`,
      state: this.cachedState,
    };
  }

  async connectMultipleBluetooth(macs = [], connect = true) {
    const cleanMacs = (Array.isArray(macs) ? macs : [])
      .map((m) => String(m || '').replace(/[^0-9A-Fa-f]/g, ''))
      .filter((m) => /^[0-9A-Fa-f]{12}$/.test(m))
      .slice(0, 6);
    if (cleanMacs.length === 0) {
      return { ok: false, count: 0, total: 0, message: 'Select 1 or more Bluetooth devices first.', state: this.cachedState };
    }
    if (connect && !this.cachedState.bluetoothOn) {
      await this.setRadioState('Bluetooth', true);
    }
    const results = [];
    for (const mac of cleanMacs) {
      const r = await this.connectBluetoothDevice(mac, connect);
      results.push({ mac, ok: Boolean(r?.direct || r?.ok), message: r?.message || '' });
    }
    await this.refresh(true);
    const count = results.filter((x) => x.ok).length;
    return {
      ok: count > 0,
      count,
      total: cleanMacs.length,
      results,
      message: `${connect ? 'Connected' : 'Disconnected'} ${count}/${cleanMacs.length} Bluetooth device(s)`,
      state: this.cachedState,
    };
  }

  async toggleMute() {
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PetFishAudio {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[PetFishAudio]::keybd_event(0xAD, 0, 0, [UIntPtr]::Zero)
[PetFishAudio]::keybd_event(0xAD, 0, 2, [UIntPtr]::Zero)
Write-Output "OK"
`;
    const res = await runPowerShell(ps, {}, 3500);
    return { ok: res.ok, message: 'Toggled system audio mute' };
  }

  lockPC() {
    try {
      const child = spawn('rundll32.exe', ['user32.dll,LockWorkStation'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', () => {});
      child.unref();
      return { ok: true, message: 'Locking PC...' };
    } catch {
      return { ok: false, message: 'Could not lock PC' };
    }
  }

  openSettingsUri(uri) {
    const safe = String(uri || '').trim();
    if (!SAFE_SETTINGS_URIS.has(safe)) return { ok: false, message: 'Blocked settings URI' };
    try {
      const child = spawn('explorer.exe', [safe], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.on('error', () => {});
      child.unref();
      return { ok: true, message: `Opened ${safe}` };
    } catch {
      return { ok: false, message: 'Could not open settings' };
    }
  }
}

module.exports = { SystemControls };
