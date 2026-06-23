$c = [System.IO.File]::ReadAllText("c:\vibe projects\Antigravity remote\backend\temp_proto.txt", [System.Text.Encoding]::Unicode)
Write-Host "=== FIRST 5000 CHARS ==="
Write-Host $c.Substring(0, [Math]::Min(5000, $c.Length))
Write-Host ""
Write-Host "=== LAST 2000 CHARS ==="
Write-Host $c.Substring([Math]::Max(0, $c.Length - 2000))
