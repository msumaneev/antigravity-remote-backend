$action = New-ScheduledTaskAction -Execute 'pm2' -Argument 'start "C:\vibe projects\Antigravity remote\backend\ecosystem.config.js"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId (Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -ExpandProperty PrimaryOwnerName) -LogonType Interactive
Register-ScheduledTask -TaskName "AntigravityRemoteBackend" -Action $action -Trigger $trigger -Principal $principal -Description "Auto-starts Antigravity Remote backend and Cloudflare tunnel via PM2" -Force
Write-Host "Scheduled task created successfully."
