@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.tools\node-v24.22.2-win-x64;%PATH%"
node scripts\theme-preview.mjs firefly dev
if errorlevel 1 pause
