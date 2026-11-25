@echo off
title Zuno
rem Opens the installed Zuno app. If it isn't installed yet, opens the website to download it.
set "ZUNO_EXE=%LOCALAPPDATA%\Programs\zuno\Zuno.exe"

if exist "%ZUNO_EXE%" (
  start "" "%ZUNO_EXE%"
  exit /b
)

echo.
echo   Zuno isn't installed yet. Opening the website - click Download for Windows,
echo   run Zuno-Setup.exe, then open Zuno from the Start menu or your desktop.
echo.
start "" https://pawsdarter-spec.github.io/zuno/
timeout /t 6 >nul
