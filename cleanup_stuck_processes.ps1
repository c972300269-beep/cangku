# ============================================================
# WorkBuddy stuck-process cleanup (SAFE version)
# Cleans ONLY Playwright leftovers + timed-out script processes.
# Never touches: WorkBuddy itself, user's normal Chrome, system procs.
# NOTE: ASCII-only on purpose - PowerShell 5.1 reads UTF-8-no-BOM as GBK.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"

$logFile = "$env:USERPROFILE\.workbuddy\cleanup.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$killed = 0

function Write-Log($msg) { Add-Content -Path $logFile -Value $msg }

Write-Log "[$timestamp] === cleanup start ==="

# ---------- 1. chrome-headless-shell (Playwright only, always safe) ----------
$shells = Get-Process -Name "chrome-headless-shell" -ErrorAction SilentlyContinue
foreach ($p in $shells) {
    Stop-Process -Id $p.Id -Force
    $killed++
    Write-Log "  [1] KILLED headless-shell PID=$($p.Id)"
}

# ---------- 2. Playwright-bundled chromium (matched by install path) ----------
# User's real Chrome lives in AppData\Local\Google\Chrome or Program Files\Google -> never matched
$allChrome = @(Get-Process -Name "chrome","chromium" -ErrorAction SilentlyContinue)
foreach ($p in $allChrome) {
    $path = ""
    try { $path = $p.Path } catch { $path = "" }
    if ($path -and ($path -match "ms-playwright" -or $path -match "playwright")) {
        Stop-Process -Id $p.Id -Force
        $killed++
        Write-Log "  [2] KILLED playwright-browser PID=$($p.Id)  $path"
    }
}

# ---------- 3. node.exe scripts running longer than 30 minutes ----------
# Only matches command lines pointing at .workbuddy\scripts
$cutoff = (Get-Date).AddMinutes(-30)
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
foreach ($np in $nodeProcs) {
    $cmd = $np.CommandLine
    if ([string]::IsNullOrEmpty($cmd)) { continue }
    if ($cmd -notmatch "\.workbuddy[\\/]scripts") { continue }

    $st = $null
    try { $st = [Management.ManagementDateTimeConverter]::ToDateTime($np.CreationDate) } catch { $st = $null }
    if ($st -and $st -lt $cutoff) {
        Stop-Process -Id $np.ProcessId -Force
        $killed++
        Write-Log "  [3] KILLED stuck-node PID=$($np.ProcessId) started=$st"
    }
}

# ---------- 4. Remove stale Playwright temp profile dirs (frees disk) ----------
$removed = 0
$dirs = Get-ChildItem -Path $env:TEMP -Filter "playwright*" -Directory -ErrorAction SilentlyContinue
foreach ($d in $dirs) {
    if ($d.CreationTime -lt (Get-Date).AddHours(-2)) {
        Remove-Item -Path $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
        $removed++
    }
}
if ($removed -gt 0) { Write-Log "  [4] removed $removed playwright temp dir(s)" }

# ---------- 5. Trim log to last 500 lines ----------
if (Test-Path $logFile) {
    $lines = Get-Content $logFile -ErrorAction SilentlyContinue
    if ($lines.Count -gt 800) {
        $lines | Select-Object -Last 500 | Set-Content $logFile -Encoding UTF8
    }
}

Write-Log "[$timestamp] === cleanup done: $killed process(es) handled ==="
Write-Output "CLEANUP_DONE killed=$killed"
