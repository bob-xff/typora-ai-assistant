#Requires -Version 5.1
<#
    xff Assistant No.1 - Security self-audit
    ------------------------------------------------------------------
    Runnable companion to SECURITY.md. Double-click, or:
        powershell -NoProfile -ExecutionPolicy Bypass -File .\security-audit.ps1
    Output is pure ASCII so it renders correctly in any console.
#>
$ErrorActionPreference = 'Continue'
try { $root = Split-Path -Parent $MyInvocation.MyCommand.Path } catch { $root = (Get-Location).Path }
Set-Location $root

$script:ok = 0
$script:bad = 0
function Pass { param($m) Write-Host "  [OK] $m" -ForegroundColor Green; $script:ok++ }
function Warn { param($m) Write-Host "  [!!] $m" -ForegroundColor Yellow; $script:bad++ }
function Skip { param($m) Write-Host "  [--] $m" -ForegroundColor DarkGray }
function Head { param($m) Write-Host ""; Write-Host "== $m ==" -ForegroundColor Cyan }

$SECRET_RE = 'sk-[A-Za-z0-9]{20,}'

Write-Host ""
Write-Host "  xff Assistant No.1  -  Security Audit" -ForegroundColor Magenta
Write-Host "  root: $root" -ForegroundColor Gray

# ---------------------------------------------------------------- git tracked set
$tracked = @()
try { $tracked = @(& git ls-files 2>$null) } catch {}
$hasGit = $tracked.Count -gt 0

# ================================================================= A. credentials
Head 'A. Credentials & secrets'

if ($hasGit) {
    $leak = @($tracked | Where-Object { $_ -match 'config\.json$' -and $_ -notmatch 'example' })
    if ($leak.Count) { Warn "private config is tracked by git: $($leak -join ', ')" }
    else { Pass 'no private config.json tracked by git' }
} else { Skip 'not a git repo - skipped tracked-file checks' }

# scan working tree for hardcoded keys (exclude private config, dist, .git, .workbuddy)
$scanFiles = @()
foreach ($ext in @('*.js','*.json','*.css','*.ps1','*.bat','*.md','*.svg','*.py')) {
    $scanFiles += Get-ChildItem -Path $root -Recurse -File -Filter $ext -ErrorAction SilentlyContinue
}
$scanFiles = $scanFiles | Where-Object {
    $_.FullName -notmatch '\\(dist|\.git|\.workbuddy|node_modules)\\' -and
    $_.Name -ne 'config.json'
}
$keyHits = @($scanFiles | Select-String -Pattern $SECRET_RE -ErrorAction SilentlyContinue)
if ($keyHits.Count) {
    Warn "possible hardcoded key in: $(($keyHits | ForEach-Object { $_.Filename } | Select-Object -Unique) -join ', ')"
} else { Pass 'no hardcoded API key found (excluding local config.json)' }

if (Test-Path 'plugin/config.example.json') {
    try {
        $ex = Get-Content 'plugin/config.example.json' -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$ex.apiKey)) { Pass 'config.example.json apiKey is empty' }
        else { Warn 'config.example.json contains a non-empty apiKey!' }
    } catch { Warn 'config.example.json is not valid JSON' }
} else { Warn 'plugin/config.example.json is missing' }

# ================================================================= B. distribution
Head 'B. Distribution package'
if (Test-Path 'dist') {
    $zipHits = @(Get-ChildItem 'dist' -Recurse -File -Include *.json -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne 'config.example.json' } |
        Select-String -Pattern $SECRET_RE -ErrorAction SilentlyContinue)
    if ($zipHits.Count) { Warn 'dist/ contains a possible real API key' }
    else { Pass 'dist/ contains no API key' }

    $badFiles = @(Get-ChildItem 'dist' -Recurse -File | Where-Object { $_.Name -eq 'config.json' })
    if ($badFiles.Count) { Warn "dist/ ships a config.json: $($badFiles.FullName -join ', ')" }
    else { Pass 'dist/ ships no private config.json' }
} else { Skip 'dist/ not present - skipped (run build-release.ps1 first)' }

# ================================================================= C. network
Head 'C. Network & bridge'
if (Test-Path 'bridge/server.js') {
    $sv = Get-Content 'bridge/server.js' -Raw
    if ($sv -match "listen\(\s*CONFIG\.port\s*,\s*'127\.0\.0\.1'") { Pass 'bridge listens on 127.0.0.1 only' }
    else { Warn 'bridge listen() is not clearly bound to 127.0.0.1' }
    if ($sv -match 'originAllowed') { Pass 'origin guard present (CSRF / DNS-rebinding)' } else { Warn 'origin guard missing' }
    if ($sv -match 'sseGuard' -and $sv -match 'guard\(') { Pass 'write endpoints are guarded (token)' } else { Warn 'write endpoints may lack token guard' }
} else { Skip 'bridge/server.js not present' }

# ================================================================= D. rendering
Head 'D. Frontend rendering (XSS)'
if (Test-Path 'plugin/client.js') {
    $cl = Get-Content 'plugin/client.js' -Raw
    if ($cl -match 'function safeHref') { Pass 'link protocol allow-list (safeHref) present' } else { Warn 'safeHref missing - links unguarded' }
    if ($cl -match 'function esc\(') { Pass 'esc() present' } else { Warn 'esc() missing' }
}
$node = $null
$nodeCands = @()
if ($env:ProgramFiles) { $nodeCands += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
if (${env:ProgramFiles(x86)}) { $nodeCands += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') }
foreach ($c in $nodeCands) { if (-not $node -and (Test-Path $c)) { $node = $c } }
if (-not $node) { $cmd = Get-Command node -ErrorAction SilentlyContinue; if ($cmd) { $node = $cmd.Source } }

if ($node -and (Test-Path 'scripts/xss-probe.js')) {
    $out = & $node 'scripts/xss-probe.js' 2>&1
    $code = $LASTEXITCODE
    if ($code -eq 0) { Pass 'renderer XSS regression: all payloads blocked' }
    else { Warn 'renderer XSS regression FAILED - see output below'; $out | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow } }
} else { Skip 'node or scripts/xss-probe.js unavailable - skipped render test' }

# ================================================================= F. privacy
Head 'F. Privacy & repo hygiene'
if ($hasGit) {
    $p1 = @($tracked | Where-Object { $_ -match '^\.workbuddy/|^dist/' })
    if ($p1.Count) { Warn "sensitive paths tracked: $($p1 -join ', ')" } else { Pass 'no .workbuddy/ or dist/ tracked' }

    $p2 = @()
    foreach ($f in $tracked) {
        if (Test-Path $f) {
            $m = Select-String -Path $f -Pattern 'C:\\Users\\' -ErrorAction SilentlyContinue
            if ($m) { $p2 += $f }
        }
    }
    if ($p2.Count) { Warn "absolute user paths found in: $(($p2 | Select-Object -Unique) -join ', ')" }
    else { Pass 'no absolute user paths in tracked files' }
} else { Skip 'not a git repo - skipped privacy checks' }

# ================================================================= summary
Write-Host ""
Write-Host "  ----------------------------------------------------------" -ForegroundColor Cyan
if ($script:bad -eq 0) {
    Write-Host "  RESULT: PASS  ($($script:ok) checks passed)" -ForegroundColor Green
} else {
    Write-Host "  RESULT: $($script:ok) passed, $($script:bad) to review" -ForegroundColor Yellow
}
Write-Host "  See SECURITY.md for the manual checklist and known trade-offs." -ForegroundColor Gray
Write-Host "  ----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
if ($Host.Name -eq 'ConsoleHost') { Read-Host 'Press Enter to close' | Out-Null }
