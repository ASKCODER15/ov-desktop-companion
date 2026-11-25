# OV v8.0.0 — 1-Click Local Open-Source Whisper Voice Pack & Neural TTS Installer
# Run via: npm run setup:voice
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OV v8.0.0 // Local Whisper Voice Pack & Neural Voice Setup" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

function Find-Python {
  $candidates = @()
  if ($env:OV_PYTHON_BIN) { $candidates += $env:OV_PYTHON_BIN }
  $localPy = Join-Path $env:LOCALAPPDATA "Programs\Python"
  foreach ($ver in @("Python313", "Python312", "Python311", "Python310")) {
    $candidates += (Join-Path $localPy "$ver\python.exe")
    $candidates += "C:\Program Files\$ver\python.exe"
    $candidates += "C:\$ver\python.exe"
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$py = Find-Python
if (-not $py) {
  Write-Host "[ERROR] Python 3.10+ was not found on your Windows PC." -ForegroundColor Red
  Write-Host "Please install Python 3.12 from https://www.python.org/downloads/windows/" -ForegroundColor Yellow
  Write-Host "(Check 'Add python.exe to PATH' during installation), then re-run: npm run setup:voice" -ForegroundColor Yellow
  exit 1
}

Write-Host "[1/3] Using Python: $py" -ForegroundColor Green
& $py --version

Write-Host ""
Write-Host "[2/3] Installing Local Whisper (faster-whisper), PyAudio, NumPy, and Neural Voices (edge-tts)..." -ForegroundColor Green
$reqFile = Join-Path $PSScriptRoot "..\requirements-voice.txt"
& $py -m pip install --upgrade pip
& $py -m pip install -r $reqFile

Write-Host ""
Write-Host "[3/3] Downloading offline open-source Whisper model (Systran/faster-whisper-base ~145 MB)..." -ForegroundColor Green
$pyVerify = @"
from faster_whisper import WhisperModel
import pyaudio
model = WhisperModel("base", device="cpu", compute_type="int8")
pa = pyaudio.PyAudio()
mic_count = pa.get_device_count()
pa.terminate()
print(f"OK: faster-whisper-base cached locally | Audio devices detected: {mic_count}")
"@
& $py -c $pyVerify

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE! Press A + S + W anywhere on Windows to talk!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
