@echo off
cd /d "%~dp0backend"
call npm install
call node index.js
pause