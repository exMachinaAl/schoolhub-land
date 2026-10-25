@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo [GAGAL] Node.js belum ditemukan. Pasang Node.js 20+.
 pause
 exit /b 1
)
node scripts\setup-admin.mjs
pause
