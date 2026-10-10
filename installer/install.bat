@echo off
rem ============================================================
rem  Typora AI Study Assistant - Installer (v2.3)
rem  Double-click this file. It will ask for admin rights.
rem  (Keep this file ASCII-only: cmd.exe does not handle
rem   UTF-8 without BOM + Chinese text reliably.)
rem ============================================================
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [X] PowerShell not found. Please run install.ps1 manually.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set RC=%ERRORLEVEL%

if not "%RC%"=="0" (
  echo.
  echo [!] Installer exited with code %RC%.
  pause
)
endlocal
