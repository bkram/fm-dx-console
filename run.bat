@echo off
setlocal

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Run Electron with any passed arguments
npm run electron -- %*

endlocal
