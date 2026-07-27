@echo off
rem EZ Tracker launcher - starts the server and opens the app
cd /d "%~dp0"
start "EZ TRACKER Server" /min node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3801"
