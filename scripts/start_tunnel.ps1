$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$cloudflaredPath = Join-Path $scriptDir "cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "Downloading cloudflared.exe..."
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredPath
    Write-Host "Download complete."
}

Write-Host "Starting Cloudflare Quick Tunnel for localhost:8080..."
$logPath = "$scriptDir\..\.cloudflare_log.txt"
if (Test-Path $logPath) {
    Remove-Item $logPath -Force
}
$process = Start-Process -FilePath $cloudflaredPath -ArgumentList "tunnel --url http://localhost:8080" -NoNewWindow -PassThru -RedirectStandardError $logPath

$maxRetries = 20
$retryCount = 0
$url = ""
while ($retryCount -lt $maxRetries -and [string]::IsNullOrEmpty($url)) {
    Start-Sleep -Seconds 2
    if (Test-Path $logPath) {
        $urlLine = Select-String -Pattern "https://[a-zA-Z0-9-]+\.trycloudflare\.com" -Path $logPath | Select-Object -First 1
        if ($urlLine) {
            $url = $urlLine.Matches[0].Value
        }
    }
    $retryCount++
}

if ($url) {
    $url | Out-File -FilePath "$scriptDir\..\.cloudflare_url" -Encoding utf8 -Force
    Write-Host "Cloudflare URL obtained: $url"
} else {
    Write-Host "Failed to obtain Cloudflare URL after 40 seconds."
}

$process.WaitForExit()
