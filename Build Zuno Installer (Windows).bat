@echo off
title Building the Zuno installer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js isn't installed yet. Install the LTS version from nodejs.org, then try again.
  start "" https://nodejs.org/
  pause
  exit /b
)

if not exist "node_modules\electron-builder" (
  echo   First-time setup: downloading the app parts. This takes a few minutes...
  call npm install
  if errorlevel 1 ( echo   Setup failed. & pause & exit /b )
)

rem Remember this folder, so the installed Zuno always runs the newest code from here.
call node -e "require('fs').writeFileSync('electron/source.json', JSON.stringify({ dir: process.cwd() }))"

echo.
echo   Building Zuno-Setup.exe ... this can take a few minutes.
echo.
call npx electron-builder --win
if errorlevel 1 ( echo. & echo   The build failed - copy the red text above and send it to Claude. & pause & exit /b )

echo.
echo   Done! Opening the installer now...
start "" "%~dp0dist\Zuno-Setup.exe"
