@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.tools\node-v24.22.2-win-x64;%PATH%"
node scripts\theme-preview.mjs firefly build
if errorlevel 1 goto failed
node scripts\theme-preview.mjs firefly preview
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
