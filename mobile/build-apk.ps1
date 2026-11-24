# Reproducible PetFish Android APK Build Script (Zero Gradle bloat — uses official Android SDK build-tools + JDK)
param(
  [string]$SdkRoot = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" })
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $PSScriptRoot "android"
$BuildDir = Join-Path $AndroidDir "build"
$AssetsDir = Join-Path $AndroidDir "assets"
$OutputApk = Join-Path $PSScriptRoot "PetFish-Mobile.apk"

# Locate latest installed Android platform & build-tools
$BuildTools = Get-ChildItem (Join-Path $SdkRoot "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1
$PlatformDir = Get-ChildItem (Join-Path $SdkRoot "platforms") -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $BuildTools -or -not $PlatformDir) {
  throw "Android SDK build-tools or platforms not found under $SdkRoot"
}

$Aapt2 = Join-Path $BuildTools.FullName "aapt2.exe"
$D8 = Join-Path $BuildTools.FullName "d8.bat"
$ZipAlign = Join-Path $BuildTools.FullName "zipalign.exe"
$ApkSigner = Join-Path $BuildTools.FullName "apksigner.bat"
$AndroidJar = Join-Path $PlatformDir.FullName "android.jar"

Write-Host "Using BuildTools: $($BuildTools.Name) | Platform: $($PlatformDir.Name)"

# Prepare fresh build dirs + sync bundled offline-first mobile HTML + generate launcher icon
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $BuildDir, (Join-Path $BuildDir "res-compiled"), (Join-Path $BuildDir "gen"), (Join-Path $BuildDir "classes"), (Join-Path $BuildDir "dex"), $AssetsDir, (Join-Path $AndroidDir "res\mipmap-xxhdpi") | Out-Null

Copy-Item (Join-Path $PSScriptRoot "web\index.html") (Join-Path $AssetsDir "index.html") -Force

# Generate crisp 192x192 PNG launcher icon from approved OV monogram avatar (fallback to iconGenerator if missing)
$OvAvatar = Join-Path $RepoRoot "docs\assets\ov-github-avatar.png"
$LauncherOut = Join-Path $AndroidDir "res\mipmap-xxhdpi\ic_launcher.png"
if (Test-Path $OvAvatar) {
  Add-Type -AssemblyName System.Drawing
  $srcImg = [System.Drawing.Image]::FromFile($OvAvatar)
  $bmp = New-Object System.Drawing.Bitmap(192, 192)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($srcImg, 0, 0, 192, 192)
  $bmp.Save($LauncherOut, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $srcImg.Dispose()
} else {
  node -e "const fs=require('fs'), {createAppLogoPng}=require(process.argv[1]); fs.writeFileSync(process.argv[2], createAppLogoPng(192));" (Join-Path $RepoRoot "src\services\iconGenerator.js") $LauncherOut
}

# 1. Compile resources with aapt2
& $Aapt2 compile --dir (Join-Path $AndroidDir "res") -o (Join-Path $BuildDir "res-compiled\resources.zip")
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

# 2. Link resources + AndroidManifest + assets into base APK & generate R.java
$UnalignedApk = Join-Path $BuildDir "unaligned.apk"
& $Aapt2 link `
  -o $UnalignedApk `
  -I $AndroidJar `
  --manifest (Join-Path $AndroidDir "AndroidManifest.xml") `
  -A $AssetsDir `
  --java (Join-Path $BuildDir "gen") `
  (Join-Path $BuildDir "res-compiled\resources.zip")
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

# 3. Compile Java sources (JDK 11 bytecode target for Android d8 compatibility)
$JavaFiles = @(Get-ChildItem (Join-Path $AndroidDir "src"), (Join-Path $BuildDir "gen") -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
& javac --release 11 -classpath $AndroidJar -d (Join-Path $BuildDir "classes") @JavaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

# 4. Convert .class files to Dalvik classes.dex via d8
$ClassFiles = @(Get-ChildItem (Join-Path $BuildDir "classes") -Recurse -Filter "*.class" | ForEach-Object { $_.FullName })
& $D8 --min-api 24 --lib $AndroidJar --output (Join-Path $BuildDir "dex") @ClassFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

# 5. Add classes.dex into APK archive
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($UnalignedApk, [System.IO.Compression.ZipArchiveMode]::Update)
$dexEntry = $zip.GetEntry("classes.dex")
if ($dexEntry) { $dexEntry.Delete() }
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $BuildDir "dex\classes.dex"), "classes.dex", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
$zip.Dispose()

# 6. Align APK
$AlignedApk = Join-Path $BuildDir "aligned.apk"
& $ZipAlign -f -p 4 $UnalignedApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# 7. Sign APK with private local keystore + per-user random password stored OUTSIDE Git repo (%LOCALAPPDATA%\PetFish\)
$PrivateDir = Join-Path $env:LOCALAPPDATA "PetFish"
New-Item -ItemType Directory -Force -Path $PrivateDir | Out-Null
$Keystore = Join-Path $PrivateDir "mobile-signing.jks"
$PassFile = Join-Path $PrivateDir ".apk-keystore-pass"

# Resolve signing password from env override or user-locked local secret file (ZERO hardcoded password in Git!)
if ($env:AURA_KEYSTORE_PASS) {
  $KsPass = $env:AURA_KEYSTORE_PASS.Trim()
} elseif (Test-Path $PassFile) {
  $KsPass = (Get-Content $PassFile -Raw).Trim()
} else {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $KsPass = [Convert]::ToBase64String($bytes) -replace '[^a-zA-Z0-9]', ''
  [System.IO.File]::WriteAllText($PassFile, $KsPass, [System.Text.UTF8Encoding]::new($false))
  if ($env:USERNAME) {
    & icacls.exe $PassFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  }
  # If a legacy pre-v6 keystore existed without a passfile, regenerate cleanly with the new strong secret
  if (Test-Path $Keystore) {
    Remove-Item $Keystore -Force
  }
}

$env:AURA_KS_PASS = $KsPass
try {
  if (-not (Test-Path $Keystore)) {
    & keytool -genkeypair -v -keystore $Keystore -alias petfish -keyalg RSA -keysize 2048 -validity 10000 -storepass:env AURA_KS_PASS -keypass:env AURA_KS_PASS -dname "CN=OV Local, O=OV, C=IN"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
    if ($env:USERNAME) {
      & icacls.exe $Keystore /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    }
  }

  & $ApkSigner sign --ks $Keystore --ks-key-alias petfish --ks-pass env:AURA_KS_PASS --key-pass env:AURA_KS_PASS --out $OutputApk $AlignedApk
  if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }
} finally {
  Remove-Item Env:AURA_KS_PASS -ErrorAction SilentlyContinue
}

& $ApkSigner verify --print-certs $OutputApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

$sizeKB = [math]::Round((Get-Item $OutputApk).Length / 1KB, 1)
Write-Host "SUCCESS! Built & signed Android APK: $OutputApk ($sizeKB KB)"
