#Requires -Version 5.1
<#
    xff助手一号 · 卸载脚本
    ------------------------------------------------------------------
    双击同目录的 uninstall.bat 即可（会自动请求管理员权限）。

    做这几件事：
      1. 从 window.html 里移除注入的 <script> 标签
         （若存在 window.html.bak，直接用它还原，最干净）
      2. 删除 <Typora>\resources\app\typora-ai-bridge\ 目录
      3. 保留 window.html.bak 以防万一

    注意：config.json 里可能存有你填过的 API Key，删除后需要重新配置。
#>
[CmdletBinding()]
param(
    [string]$TyporaRoot = '',
    [switch]$NoElevate,
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'

$PLUGIN_NAME = 'typora-ai-bridge'

function Say   { param($m, $c) Write-Host "  $m" -ForegroundColor $(if ($c) { $c } else { 'Gray' }) }
function Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn2 { param($m) Write-Host "  [ !] $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "  [ X] $m" -ForegroundColor Red }
function Pause-IfInteractive { if (-not $Silent) { Read-Host '按 Enter 关闭' | Out-Null } }

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host '        xff助手一号  ·  卸载' -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- 提权

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevate) {
    Warn2 '修改 Typora 安装目录需要管理员权限，正在请求提权…'
    $psExe   = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $argLine = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $MyInvocation.MyCommand.Path
    if ($TyporaRoot) { $argLine += ' -TyporaRoot "{0}"' -f $TyporaRoot }
    try { Start-Process -FilePath $psExe -ArgumentList $argLine -Verb RunAs | Out-Null }
    catch { Fail '提权被取消。请右键 uninstall.bat →「以管理员身份运行」。'; Pause-IfInteractive }
    exit
}

if ($isAdmin) { Ok '已获得管理员权限' }

# ---------------------------------------------------------------- 定位 Typora

function Find-WindowHtml {
    param([string]$Root)
    $roots = New-Object System.Collections.Generic.List[string]
    if ($Root) { $roots.Add($Root) }
    else {
        if ($env:ProgramFiles)        { $roots.Add((Join-Path $env:ProgramFiles 'Typora')) }
        if (${env:ProgramFiles(x86)}) { $roots.Add((Join-Path ${env:ProgramFiles(x86)} 'Typora')) }
        if ($env:LOCALAPPDATA)        { $roots.Add((Join-Path $env:LOCALAPPDATA 'Programs\Typora')) }
        try {
            $keys = @(
                'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
            )
            foreach ($k in $keys) {
                Get-ItemProperty $k -ErrorAction SilentlyContinue |
                    Where-Object { $_.DisplayName -like 'Typora*' -and $_.InstallLocation } |
                    ForEach-Object { $roots.Add($_.InstallLocation) }
            }
        } catch {}
    }
    $rels = @('resources\app\window.html', 'resources\window.html', 'resources\appsrc\window.html')
    foreach ($r in $roots) {
        if (-not $r) { continue }
        $r = $r.TrimEnd('\')
        if (-not (Test-Path $r)) { continue }
        foreach ($rel in $rels) {
            $p = Join-Path $r $rel
            if (Test-Path $p) { return $p }
        }
    }
    return $null
}

$windowHtml = Find-WindowHtml -Root $TyporaRoot
if (-not $windowHtml) { Fail '没有找到 Typora 安装目录。'; Pause-IfInteractive; exit 1 }

$appDir = Split-Path $windowHtml -Parent
$destDir = Join-Path $appDir $PLUGIN_NAME
$backup  = "$windowHtml.bak"

if (Get-Process -Name 'Typora' -ErrorAction SilentlyContinue) {
    Warn2 'Typora 正在运行，请先关闭它再卸载。'
    Pause-IfInteractive
    exit 1
}

# ---------------------------------------------------------------- 还原 window.html

if (Test-Path $backup) {
    Copy-Item -Path $backup -Destination $windowHtml -Force
    Ok '已用 window.html.bak 还原（最干净）'
} else {
    $utf8    = New-Object System.Text.UTF8Encoding($false)
    $content = [System.IO.File]::ReadAllText($windowHtml, [System.Text.Encoding]::UTF8)
    $pattern = '<script src="\./' + [regex]::Escape($PLUGIN_NAME) + '/inject\.js"></script>'
    if ($content -match $pattern) {
        $content = $content -replace $pattern, ''
        [System.IO.File]::WriteAllText($windowHtml, $content, $utf8)
        Ok '已移除注入的 <script> 标签'
    } else {
        Say '没有找到注入标记，跳过（可能本来就没装）'
    }
}

# ---------------------------------------------------------------- 删除插件目录

if (Test-Path $destDir) {
    Remove-Item -Path $destDir -Recurse -Force -Confirm:$false
    Ok "已删除插件目录：$destDir"
} else {
    Say '插件目录不存在，跳过'
}

Write-Host ''
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   卸载完成。重启 Typora 后插件即消失。' -ForegroundColor Cyan
Write-Host "   备份文件保留在：$backup" -ForegroundColor Gray
Write-Host '   插件面板里的 API Key 保存在 Typora 本地存储中，' -ForegroundColor Gray
Write-Host '   如需一并清除，可在 Typora 里执行 localStorage.clear()。' -ForegroundColor Gray
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host ''
Pause-IfInteractive
