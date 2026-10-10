@echo off
rem ============================================================
rem  Typora AI Study Assistant - Uninstaller
rem  Double-click this file. It will ask for admin rights.
rem ============================================================
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [X] PowerShell not found. Please run uninstall.ps1 manually.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set RC=%ERRORLEVEL%

if not "%RC%"=="0" (
  echo.
  echo [!] Uninstaller exited with code %RC%.
  pause
)
endlocal
