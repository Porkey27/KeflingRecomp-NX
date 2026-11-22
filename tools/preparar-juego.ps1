# preparar-juego.ps1 — Windows version of the game-preparation script.
# Prepare the game/ folder from your own copy of
# "A World of Keflings" (Xbox 360 XBLA, Title ID 584109DE).
#
# Usage (PowerShell):
#   .\tools\preparar-juego.ps1 -SourceDir "C:\path\to\584109DE"
#
# Requirements (all must be in PATH):
#   rexglue.exe   — ReXGlue CLI  https://github.com/rexglue/rexglue-sdk
#   ffmpeg.exe    — audio conversion
#   python.exe    — manifest validation

param(
    [Parameter(Mandatory=$true)]
    [string]$SourceDir
)

$ErrorActionPreference = "Stop"
$TITLE_ID = "584109DE"

function Info  { param($m) Write-Host "[preparar] $m" -ForegroundColor Green  }
function Warn  { param($m) Write-Host "[preparar] $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Error "[preparar] $m" }

# ── Dependency check ──────────────────────────────────────────────────────────
foreach ($dep in @("rexglue","ffmpeg","python")) {
    if (-not (Get-Command $dep -ErrorAction SilentlyContinue)) {
        Fail "Required tool not found in PATH: $dep"
    }
}

# ── Setup ─────────────────────────────────────────────────────────────────────
if (-not (Test-Path $SourceDir -PathType Container)) {
    Fail "Source directory not found: $SourceDir"
}

$Out = Join-Path (Get-Location) "game"
foreach ($d in @("media","audio_opus","shaders_spv")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Out $d) | Out-Null
}

# ── 1. Copy XEX ───────────────────────────────────────────────────────────────
Info "Locating default.xex ..."
$xex = Get-ChildItem -Path $SourceDir -Filter "default.xex" -Recurse -ErrorAction SilentlyContinue |
       Select-Object -First 1
if (-not $xex) { Fail "Could not find default.xex under $SourceDir" }
Copy-Item $xex.FullName (Join-Path $Out "default.xex") -Force
Info "  -> $Out\default.xex"

# ── 2. Copy media ─────────────────────────────────────────────────────────────
Info "Copying media assets ..."
$mediaSrc = Get-ChildItem -Path $SourceDir -Filter "media" -Recurse -Directory |
            Select-Object -First 1
if ($mediaSrc) {
    Copy-Item "$($mediaSrc.FullName)\*" (Join-Path $Out "media") -Recurse -Force
} else {
    Warn "No media\ directory found"
}

# ── 3. XMA2 → Opus ───────────────────────────────────────────────────────────
Info "Converting XMA2 audio to Opus ..."
$xmaFiles = Get-ChildItem -Path $SourceDir -Include @("*.xma","*.xwb") -Recurse -ErrorAction SilentlyContinue
if (-not $xmaFiles) {
    Warn "No .xma/.xwb files found — skipping audio conversion"
} else {
    foreach ($xma in $xmaFiles) {
        $base    = [System.IO.Path]::GetFileNameWithoutExtension($xma.Name)
        $outOgg  = Join-Path $Out "audio_opus\$base.ogg"
        if (-not (Test-Path $outOgg)) {
            & ffmpeg -v error -i $xma.FullName -c:a libopus -b:a 128k $outOgg
            if ($LASTEXITCODE -eq 0) { Info "  converted: $base.ogg" }
            else                      { Warn "  failed: $($xma.Name)" }
        } else {
            Info "  already converted: $base.ogg"
        }
    }
}

# ── 4. Shader recompile ───────────────────────────────────────────────────────
Info "Recompiling shaders ..."
$shaderFiles = Get-ChildItem -Path $SourceDir -Include @("*.xbx","*.xvs","*.xps") -Recurse -ErrorAction SilentlyContinue
if (-not $shaderFiles) {
    Warn "No shader blobs found — runtime translation will be used"
} else {
    foreach ($shader in $shaderFiles) {
        $base   = [System.IO.Path]::GetFileNameWithoutExtension($shader.Name)
        $outSpv = Join-Path $Out "shaders_spv\$base.spv"
        if (-not (Test-Path $outSpv)) {
            & rexglue shader translate $shader.FullName -o $outSpv
            if ($LASTEXITCODE -eq 0) { Info "  compiled: $base.spv" }
            else                      { Warn "  failed: $($shader.Name)" }
        }
    }
}

# ── 5. Validate ───────────────────────────────────────────────────────────────
Info "Validating manifest ..."
& python (Join-Path $PSScriptRoot "validate_manifest.py") $Out $TITLE_ID

Info "Done!  Copy $Out\ to sdmc:\keflings\game\ on your Switch SD card."
Info "Also copy release\keflings.toml to sdmc:\keflings\keflings.toml"
