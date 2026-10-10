#Requires -Version 5.1
<#
    Typora AI 学习助手 · 安装脚本 v2.3
    ------------------------------------------------------------------
    双击同目录的 install.bat 即可（会自动请求管理员权限）。

    做这几件事：
      1. 自动定位 Typora 安装目录（Program Files / Program Files(x86) / 用户目录）
      2. 兼容性检查：确认 window.html 里有 Node 能力入口（reqnode）
      3. 备份 window.html → window.html.bak（只在第一次备份）
      4. 部署插件前端（inject.js / client.js / client.css）到
         <Typora>\resources\app\typora-ai-bridge\
      5. 生成 config.json 配置模板（已存在则保留，不覆盖）
      6. 在 window.html 的 </body> 前注入一行 <script>

    可重复运行：已注入时只更新插件文件，不会重复插入。
    Typora 升级后会覆盖 window.html，重跑一次本脚本即可恢复。
#>
[CmdletBinding()]
param(
    [string]$TyporaRoot = '',
    [switch]$NoElevate,
    [switch]$Silent
)

$ErrorActionPreference = 'Stop'

$VERSION      = '2.3'
$PLUGIN_NAME  = 'typora-ai-bridge'

function Say   { param($m, $c) Write-Host "  $m" -ForegroundColor $(if ($c) { $c } else { 'Gray' }) }
function Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn2 { param($m) Write-Host "  [ !] $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "  [ X] $m" -ForegroundColor Red }
function Pause-IfInteractive { if (-not $Silent) { Read-Host '按 Enter 关闭' | Out-Null } }

# 安装包根目录 = 本脚本所在目录的上一级
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PKG_ROOT   = Split-Path -Parent $SCRIPT_DIR
$PLUGIN_DIR = Join-Path $PKG_ROOT 'plugin'

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host "        Typora AI 学习助手  v$VERSION  ·  安装" -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- 提权

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevate) {
    Warn2 '写入 Typora 安装目录需要管理员权限，正在请求提权…'
    $psExe   = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $argLine = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $MyInvocation.MyCommand.Path
    if ($TyporaRoot) { $argLine += ' -TyporaRoot "{0}"' -f $TyporaRoot }
    try {
        Start-Process -FilePath $psExe -ArgumentList $argLine -Verb RunAs | Out-Null
    } catch {
        Fail '提权被取消。请右键 install.bat →「以管理员身份运行」，或右键 install.ps1 →「使用 PowerShell 运行」。'
        Pause-IfInteractive
    }
    exit
}

if ($isAdmin) { Ok "已获得管理员权限" }

# ---------------------------------------------------------------- 前置检查

$INJECT_SRC = Join-Path $PLUGIN_DIR 'inject.js'
$CLIENT_SRC = Join-Path $PLUGIN_DIR 'client.js'
$CSS_SRC    = Join-Path $PLUGIN_DIR 'client.css'
$CFG_TPL    = Join-Path $PLUGIN_DIR 'config.example.json'

$missing = @()
foreach ($f in @($INJECT_SRC, $CLIENT_SRC, $CSS_SRC)) {
    if (-not (Test-Path $f)) { $missing += (Split-Path $f -Leaf) }
}
if ($missing.Count) {
    Fail "安装包不完整，缺少：$($missing -join '、')"
    Say "请把整个文件夹解压后再运行（当前目录：$PKG_ROOT）"
    Pause-IfInteractive
    exit 1
}
Ok "安装包完整（plugin 目录：$PLUGIN_DIR）"

# ---------------------------------------------------------------- 定位 Typora

function Find-WindowHtml {
    param([string]$Root)

    $roots = New-Object System.Collections.Generic.List[string]
    if ($Root) { $roots.Add($Root) }
    else {
        if ($env:ProgramFiles)      { $roots.Add((Join-Path $env:ProgramFiles 'Typora')) }
        if (${env:ProgramFiles(x86)}) { $roots.Add((Join-Path ${env:ProgramFiles(x86)} 'Typora')) }
        if ($env:LOCALAPPDATA)      { $roots.Add((Join-Path $env:LOCALAPPDATA 'Programs\Typora')) }
        if ($env:LOCALAPPDATA)      { $roots.Add((Join-Path $env:LOCALAPPDATA 'Typora')) }
        # 注册表里找卸载信息，能覆盖自定义安装路径
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
        # 再往下找一层，应对 …\Typora\resources\app\resources\app\window.html 之类
        try {
            $sub = Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -in @('resources', 'app', 'Typora') }
            foreach ($s in $sub) {
                foreach ($rel in $rels) {
                    $p = Join-Path $s.FullName $rel
                    if (Test-Path $p) { return $p }
                }
            }
        } catch {}
    }
    return $null
}

$windowHtml = Find-WindowHtml -Root $TyporaRoot
if (-not $windowHtml) {
    Fail '没有找到 Typora 的 window.html —— 可能没有安装 Typora。'
    Say '若装在自定义目录，请这样指定：'
    Say '  .\install.ps1 -TyporaRoot "D:\Apps\Typora"'
    Pause-IfInteractive
    exit 1
}

$appDir     = Split-Path $windowHtml -Parent
$typoraRoot = Split-Path (Split-Path $appDir -Parent) -Parent
Ok "找到注入点：$windowHtml"

# 版本信息（尽力而为，失败不影响安装）
try {
    $exe = Join-Path $typoraRoot 'Typora.exe'
    if (Test-Path $exe) {
        $ver = (Get-Item $exe).VersionInfo.ProductVersion
        if ($ver) { Say "Typora 版本：$ver" }
    }
} catch {}

# ---------------------------------------------------------------- 兼容性检查

$htmlText = [System.IO.File]::ReadAllText($windowHtml, [System.Text.Encoding]::UTF8)

if ($htmlText -match 'reqnode') {
    Ok '兼容性检查通过：检测到 Node 能力入口（插件可直连 AI 服务）'
} else {
    Warn2 '没在 window.html 里找到 reqnode —— 这个 Typora 版本可能太旧。'
    Warn2 '插件仍会安装，但可能只能通过可选的桥接服务工作。'
}

if (Get-Process -Name 'Typora' -ErrorAction SilentlyContinue) {
    Warn2 'Typora 正在运行 —— 注入要在你重启 Typora 之后生效。'
}

# ---------------------------------------------------------------- 备份

$backup = "$windowHtml.bak"
if (Test-Path $backup) {
    Say "备份已存在，保留原备份不动：$backup"
} else {
    Copy-Item -Path $windowHtml -Destination $backup -Force
    Ok '已备份 window.html → window.html.bak'
}

# ---------------------------------------------------------------- 部署插件

$destDir = Join-Path $appDir $PLUGIN_NAME
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

Copy-Item -Path $INJECT_SRC -Destination (Join-Path $destDir 'inject.js')  -Force
Copy-Item -Path $CLIENT_SRC -Destination (Join-Path $destDir 'client.js')  -Force
Copy-Item -Path $CSS_SRC    -Destination (Join-Path $destDir 'client.css') -Force
Copy-Item -Path $CFG_TPL    -Destination (Join-Path $destDir 'config.example.json') -Force
Ok "已部署插件文件到 $destDir"

# 配置文件：只在不存在时生成，绝不覆盖用户已有的 Key
$cfgDst = Join-Path $destDir 'config.json'
if (Test-Path $cfgDst) {
    Say '已存在 config.json，保留不动（不会覆盖你的配置）'
} elseif (Test-Path $CFG_TPL) {
    Copy-Item -Path $CFG_TPL -Destination $cfgDst -Force
    Ok '已生成 config.json（可在插件面板里直接改，无需手动编辑）'
} else {
    $template = @{
        _comment     = 'API Key 建议直接在插件界面里填（点输入框右侧齿轮），本文件可留空'
        provider     = 'deepseek'
        baseUrl      = 'https://api.deepseek.com'
        model        = 'deepseek-chat'
        apiKey       = ''
        port         = 8765
        temperature  = 0.7
        maxContextChars = 12000
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText($cfgDst, $template, (New-Object System.Text.UTF8Encoding($false)))
    Say '已生成空白配置模板 config.json'
}

# ---------------------------------------------------------------- 注入

$marker = "$PLUGIN_NAME/inject.js"
$tag    = '<script src="./' + $PLUGIN_NAME + '/inject.js"></script>'
$utf8   = New-Object System.Text.UTF8Encoding($false)   # 无 BOM，保持文件原样

if ($htmlText.Contains($marker)) {
    Say '注入标记已存在，跳过写入（插件文件已更新）'
} else {
    $idx = $htmlText.LastIndexOf('</body>')
    if ($idx -lt 0) { $idx = $htmlText.LastIndexOf('</html>') }
    if ($idx -lt 0) { $htmlText = $htmlText + $tag }
    else { $htmlText = $htmlText.Insert($idx, $tag) }
    [System.IO.File]::WriteAllText($windowHtml, $htmlText, $utf8)
    Ok '已注入 <script> 标签'
}

# ---------------------------------------------------------------- 校验

$verify = [System.IO.File]::ReadAllText($windowHtml, [System.Text.Encoding]::UTF8)
if ($verify.Contains($marker)) { Ok '校验通过：注入标记已写入' }
else { Fail '校验失败：window.html 里没有找到注入标记，请把本窗口截图反馈给开发者' }

foreach ($f in @('inject.js', 'client.js', 'client.css')) {
    $p = Join-Path $destDir $f
    if (-not (Test-Path $p)) { Fail "缺少 $f，安装不完整" }
}

# ---------------------------------------------------------------- 收尾

Write-Host ''
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host "   安装完成（v$VERSION）。接下来：" -ForegroundColor Cyan
Write-Host ''
Write-Host '   1) 重启 Typora —— 插件会自动出现，无需任何后台程序' -ForegroundColor White
Write-Host '   2) 点右下角悬浮球（或 Ctrl+Alt+K）打开面板' -ForegroundColor White
Write-Host '   3) 点输入框右侧的齿轮，填入你自己的 API Key' -ForegroundColor White
Write-Host '      Key 只存在本机，不会上传；换电脑需要重新填' -ForegroundColor Gray
Write-Host ''
Write-Host '   在正文里选中文字会弹出小浮窗：解释 / 翻译 / 说人话 / 总结' -ForegroundColor Gray
Write-Host '   卸载：双击 installer\uninstall.bat' -ForegroundColor Gray
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host ''
Pause-IfInteractive
