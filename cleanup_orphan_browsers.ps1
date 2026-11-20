# WorkBuddy Chrome/Chromium orphan process cleanup
# Kill all headless/Playwright Chrome processes that are NOT actively being used by WorkBuddy

$ErrorActionPreference = "SilentlyContinue"
$killed = 0
$logFile = "$env:USERPROFILE\.workbuddy\cleanup.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$timestamp] Starting cleanup..."

# Kill chrome-headless-shell processes (always orphaned)
$shells = Get-Process -Name "chrome-headless-shell" -ErrorAction SilentlyContinue
foreach ($p in $shells) {
    try {
        Stop-Process -Id $p.Id -Force
        $killed++
        Add-Content -Path $logFile -Value "  KILLED chrome-headless-shell PID=$($p.Id)"
    } catch {}
}

# Kill orphan chrome.exe processes (no visible window, Playwright-related)
$chromes = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
foreach ($p in $chromes) {
    try {
        $mainTitle = $p.MainWindowTitle
        # Only kill headless/orphan Chrome - skip user's normal Chrome browser
        if ([string]::IsNullOrEmpty($mainTitle) -or $mainTitle.Length -eq 0) {
            Stop-Process -Id $p.Id -Force
            $killed++
            Add-Content -Path $logFile -Value "  KILLED chrome (headless) PID=$($p.Id)"
        }
    } catch {}
}

Add-Content -Path $logFile -Value "[$timestamp] Cleanup done: $killed processes killed"
Write-Output "$killed orphan browser processes cleaned"
