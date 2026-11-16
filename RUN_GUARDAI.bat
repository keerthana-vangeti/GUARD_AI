@echo off
title GuardAI Server - Context-Aware Sensitive Prompt Guard
color 0b

echo ============================================================
echo   🛡️  Starting GuardAI Server & Launching Web Browser...
echo ============================================================
echo.

cd /d "%~dp0backend"

:: Start browser after a brief 2-second pause in background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3001"

:: Start Node.js backend server
node server.js

pause