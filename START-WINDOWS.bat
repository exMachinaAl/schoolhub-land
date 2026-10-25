@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo [GAGAL] Node.js belum ditemukan pada PATH. Pasang Node.js 20+.
 pause
 exit /b 1
)
echo Menjalankan SchoolHub pada http://127.0.0.1:3000
node server\server.mjs
if errorlevel 1 pause
