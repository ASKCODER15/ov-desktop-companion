# Creates a clean Desktop shortcut for OV (works for any Windows user!)
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ElectronExe = Join-Path $RepoRoot "node_modules\electron\dist\electron.exe"
$IconPath = Join-Path $RepoRoot "docs\assets\ov-icon.ico"
if (-not (Test-Path $IconPath)) {
  $IconPath = Join-Path $RepoRoot "assets\ov.ico"
}
if (-not (Test-Path $IconPath)) {
  $IconPath = Join-Path $RepoRoot "assets\petfish.ico"
}
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$DesktopLnk = Join-Path $DesktopDir "OV.lnk"

if (-not (Test-Path $ElectronExe)) {
  throw "Electron binary not found at $ElectronExe. Run 'npm install' first."
}
if (-not (Test-Path $IconPath)) {
  node -e "require('./src/services/iconGenerator').writePetFishIco()"
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($DesktopLnk)
$Shortcut.TargetPath = $ElectronExe
$Shortcut.Arguments = "`"$RepoRoot`""
$Shortcut.WorkingDirectory = "$RepoRoot"
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Description = "OV — Local-First AI Desktop Companion"
$Shortcut.Save()

Write-Host "Created Desktop shortcut: $DesktopLnk"
