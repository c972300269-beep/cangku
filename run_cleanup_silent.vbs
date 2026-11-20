' Silent launcher for cleanup_stuck_processes.ps1
' Runs PowerShell with window fully hidden (0 = hidden, False = don't wait)
Dim shell, ps1, cmd
Set shell = CreateObject("WScript.Shell")

ps1 = "E:\workbuddy\Claw\.workbuddy\scripts\cleanup_stuck_processes.ps1"
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """"

shell.Run cmd, 0, False
