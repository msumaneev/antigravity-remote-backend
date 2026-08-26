# ==========================================================
# Antigravity Remote Autostart & Tunnel Watchdog Supervisor
# ==========================================================
$ErrorActionPreference = "Continue"

$backendDir = "C:\vibe projects\Antigravity remote\backend"
$scriptsDir = Join-Path $backendDir "scripts"

Write-Host "[Autostart] Initializing Antigravity Remote Server..." -ForegroundColor Cyan

function Test-ServerHealth {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:8080/api/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
        return ($res.ok -eq $true)
    } catch {
        return $false
    }
}

if (-not (Test-ServerHealth)) {
    Write-Host "[Autostart] Starting backend via PM2 / npm..." -ForegroundColor Yellow
    try {
        & pm2 restart antigravity-backend
    } catch {}
    
    Start-Sleep -Seconds 3
    
    if (-not (Test-ServerHealth)) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$backendDir`" && npm run start" -WindowStyle Hidden
    }
}

$serverReady = $false
for ($i = 0; $i -lt 15; $i++) {
    if (Test-ServerHealth) {
        $serverReady = $true
        break
    }
    Start-Sleep -Seconds 2
}

if ($serverReady) {
    Write-Host "[Autostart] Backend is healthy on port 8080." -ForegroundColor Green
}

$tunnelScript = Join-Path $scriptsDir "start_tunnel.ps1"
& $tunnelScript
