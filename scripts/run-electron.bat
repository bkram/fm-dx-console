@echo off
setlocal
cd /d "%~dp0.."
call npm run electron -- %*
exit /b %errorlevel%
