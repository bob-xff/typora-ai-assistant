@echo off
rem Stop whatever is listening on port 8765 (the bridge service).
setlocal
set PORT=8765
set FOUND=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo Stopping PID %%P ...
  taskkill /PID %%P /F >nul 2>nul
  set FOUND=1
)
if "%FOUND%"=="1" (echo Done.) else (echo Nothing is listening on port %PORT%.)
endlocal
