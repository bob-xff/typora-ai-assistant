#Requires -Version 5.1
<#
    xff助手一号 · 打包脚本（开发者用）
    ------------------------------------------------------------------
    生成可分发的安装包：

      dist\typora-ai-assistant\          ← 解压即可用的文件夹
      dist\typora-ai-assistant-v2.7.0.zip ← 发给别人的压缩包

    包含内容：installer\（安装/卸载）、plugin\（插件本体）、README、VERSION。
    不含：bridge\（可选的桥接服务，仅开发者使用）、任何真实 API Key。
#>
[CmdletBinding()]
param(
    [string]$OutDir = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'

$VERSION = (Get-Content (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
$NAME    = "typora-ai-assistant-v$VERSION"
$STAGE   = Join-Path $OutDir $NAME.Replace("-v$VERSION", '')   # 目录名不带版本号，方便用户直接替换
$ZIP     = Join-Path $OutDir "$NAME.zip"

Write-Host ''
Write-Host "  打包 xff助手一号 v$VERSION" -ForegroundColor Cyan
Write-Host ''

# 清理
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force -Confirm:$false }
New-Item -ItemType Directory -Force -Path $STAGE | Out-Null

# 复制安装脚本
$dstInstaller = Join-Path $STAGE 'installer'
New-Item -ItemType Directory -Force -Path $dstInstaller | Out-Null
foreach ($f in @('install.bat', 'install.ps1', 'uninstall.bat', 'uninstall.ps1')) {
    $src = Join-Path $PSScriptRoot "installer\$f"
    if (-not (Test-Path $src)) { throw "缺少 installer\$f" }
    Copy-Item $src (Join-Path $dstInstaller $f) -Force
    Write-Host "  + installer\$f"
}

# 复制插件本体（只带示例配置，绝不带真实 Key）
$dstPlugin = Join-Path $STAGE 'plugin'
New-Item -ItemType Directory -Force -Path $dstPlugin | Out-Null
foreach ($f in @('inject.js', 'client.js', 'client.css', 'config.example.json')) {
    $src = Join-Path $PSScriptRoot "plugin\$f"
    if (-not (Test-Path $src)) { throw "缺少 plugin\$f" }
    Copy-Item $src (Join-Path $dstPlugin $f) -Force
    Write-Host "  + plugin\$f"
}

# 文档
foreach ($f in @('README.md', 'SECURITY.md', 'VERSION', 'LICENSE')) {
    $src = Join-Path $PSScriptRoot $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $STAGE $f) -Force
        Write-Host "  + $f"
    }
}

# 安全兜底：确认包里没有任何疑似真实的 API Key
$leak = Select-String -Path (Join-Path $dstPlugin '*.json') -Pattern 'sk-[A-Za-z0-9]{20,}' -ErrorAction SilentlyContinue
if ($leak) {
    Remove-Item $OutDir -Recurse -Force -Confirm:$false
    throw '安装包里检测到疑似真实 API Key，已中止打包。请检查 plugin\config.example.json。'
}

Compress-Archive -Path (Join-Path $STAGE '*') -DestinationPath $ZIP -Force

$sizeMB = [math]::Round((Get-Item $ZIP).Length / 1MB, 2)
Write-Host ''
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host "  文件夹：$STAGE" -ForegroundColor White
Write-Host "  压缩包：$ZIP  ($sizeMB MB)" -ForegroundColor Green
Write-Host ''
Write-Host '  发给别人后，对方解压 → 双击 installer\install.bat 即可。' -ForegroundColor Gray
Write-Host '  ----------------------------------------------------------' -ForegroundColor Cyan
Write-Host ''
