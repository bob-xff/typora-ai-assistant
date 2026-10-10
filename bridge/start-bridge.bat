@echo off
rem ============================================================
rem  Optional: start the local bridge service (development use).
rem  Not required for normal use -- the plugin talks to the AI
rem  provider directly from inside Typora.
rem ============================================================
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set NODE="%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo [X] Node.js not found. The bridge service needs Node.js.
    pause
    exit /b 1
  )
) else (
  set NODE=node
)

echo Starting bridge service on http://127.0.0.1:8765 ...
%NODE% "%~dp0server.js"
pause
endlocal
