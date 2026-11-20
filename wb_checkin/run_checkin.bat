@echo off
REM WorkBuddy daily checkin launcher. ASCII only (avoid GBK mojibake).
REM Auto-detects newest managed node.exe, so version upgrade never breaks it.

set "NODE_DIR=C:\Users\chenjialin3\.workbuddy\binaries\node\versions"
set "NODE_EXE="

for /f "delims=" %%d in ('dir /b /ad "%NODE_DIR%" 2^>nul') do (
  if exist "%NODE_DIR%\%%d\node.exe" set "NODE_EXE=%NODE_DIR%\%%d\node.exe"
)

if not defined NODE_EXE (
  if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)

if not exist "%NODE_EXE%" (
  echo NODE_NOT_FOUND
  exit /b 1
)

set "NODE_PATH=C:\Users\chenjialin3\.workbuddy\binaries\node\workspace\node_modules"
"%NODE_EXE%" "E:\workbuddy\Claw\.workbuddy\scripts\wb_checkin\checkin.js"
exit /b %errorlevel%
