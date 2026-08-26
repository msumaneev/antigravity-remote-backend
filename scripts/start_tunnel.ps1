# ==========================================================
# Cloudflare Tunnel with Self-Healing Watchdog & Auto-Recovery
# ==========================================================
$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backendDir = Join-Path $scriptDir ".."
$cloudflaredPath = Join-Path $scriptDir "cloudflared.exe"
$logPath = Join-Path $backendDir ".cloudflare_log.txt"
$urlFile = Join-Path $backendDir ".cloudflare_url"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "[Tunnel] Downloading cloudflared.exe..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath
    Write-Host "[Tunnel] Download complete." -ForegroundColor Green
}

while ($true) {
    Write-Host "[Tunnel] Cleaning up old cloudflared processes..." -ForegroundColor Cyan
    Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    if (Test-Path $logPath) {
        Remove-Item $logPath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[Tunnel] Launching Cloudflare Quick Tunnel for localhost:8080..." -ForegroundColor Cyan
    $process = Start-Process -FilePath $cloudflaredPath -ArgumentList "tunnel --protocol http2 --url http://localhost:8080" -NoNewWindow -PassThru -RedirectStandardError $logPath

    # Wait for URL to appear in log
    $maxRetries = 25
    $retryCount = 0
    $tunnelUrl = ""
    while ($retryCount -lt $maxRetries -and [string]::IsNullOrEmpty($tunnelUrl)) {
        Start-Sleep -Seconds 2
        if (Test-Path $logPath) {
            $urlLine = Select-String -Pattern "https://[a-zA-Z0-9-]+\.trycloudflare\.com" -Path $logPath -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($urlLine) {
                $tunnelUrl = $urlLine.Matches[0].Value
            }
        }
        $retryCount++
    }

    if ([string]::IsNullOrEmpty($tunnelUrl)) {
        Write-Host "[Tunnel] Failed to obtain URL. Retrying in 10 seconds..." -ForegroundColor Red
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 10
        continue
    }

    $tunnelUrl | Out-File -FilePath $urlFile -Encoding utf8 -Force
    Write-Host "[Tunnel] Active Cloudflare URL: $tunnelUrl" -ForegroundColor Green

    # Active Watchdog Monitoring Loop
    $failCount = 0
    while ($true) {
        Start-Sleep -Seconds 30

        # 1. Check if process is alive
        if ($process.HasExited) {
            Write-Host "[Tunnel] cloudflared process exited unexpectedly. Restarting..." -ForegroundColor Yellow
            break
        }

        # 2. Test health via local port and public tunnel URL
        $tunnelHealthy = $false
        try {
            $res = Invoke-RestMethod -Uri "$tunnelUrl/api/health" -Method Get -TimeoutSec 8 -ErrorAction Stop
            if ($res.ok -eq $true) {
                $tunnelHealthy = $true
                $failCount = 0
            }
        } catch {
            $failCount++
            Write-Host "[Tunnel] Healthcheck failed ($failCount/3): $_" -ForegroundColor Yellow
        }

        # If failed 3 consecutive times (e.g. quick tunnel expired), restart tunnel
        if ($failCount -ge 3) {
            Write-Host "[Tunnel] Tunnel unresponsive 3 times in a row. Restarting tunnel to acquire fresh URL..." -ForegroundColor Red
            if (-not $process.HasExited) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            }
            break
        }
    }

    Start-Sleep -Seconds 5
}
