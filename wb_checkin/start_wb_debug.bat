@echo off
REM 以调试端口启动 WorkBuddy（复用 .workbuddy/app 登录态）
REM 警告：若已有普通 WorkBuddy 在运行，会被结束（单例机制），请先保存工作
set PORT=9222
netstat -ano | findstr ":%PORT%" >nul 2>&1
if %errorlevel%==0 (
  echo WorkBuddy 调试端口(%PORT%)已开启，无需重复启动。
  goto :eof
)
echo 正在以调试模式启动 WorkBuddy...
taskkill /IM WorkBuddy.exe /F >nul 2>&1
timeout /t 2 >nul
start "" "C:\Users\chenjialin3\AppData\Local\Programs\WorkBuddy\WorkBuddy.exe" --remote-debugging-port=%PORT% --user-data-dir=C:\Users\chenjialin3\.workbuddy\app
echo 已启动（调试端口 %PORT%）。若端口未就绪，说明已有普通实例占用，请先关闭普通 WorkBuddy 再运行本脚本。
