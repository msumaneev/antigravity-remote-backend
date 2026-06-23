$content = [System.IO.File]::ReadAllText("c:\vibe projects\Antigravity remote\backend\temp_proto.txt", [System.Text.Encoding]::Unicode)

Write-Host "File length: $($content.Length) chars"

# Extract all rpc definitions
$rpcPattern = 'rpc\s+(\w+)\s*\(\s*(stream\s+)?\.?([.\w]+)\s*\)\s+returns\s*\(\s*(stream\s+)?\.?([.\w]+)\s*\)'
$rpcMatches = [regex]::Matches($content, $rpcPattern)
Write-Host "Total RPC methods found: $($rpcMatches.Count)"
Write-Host ""

foreach ($r in $rpcMatches) {
    $name = $r.Groups[1].Value
    $inputStream = if ($r.Groups[2].Value.Trim()) { "stream " } else { "" }
    $input = $r.Groups[3].Value
    $outputStream = if ($r.Groups[4].Value.Trim()) { "stream " } else { "" }
    $output = $r.Groups[5].Value
    Write-Host "rpc $name (${inputStream}${input}) returns (${outputStream}${output})"
}

# Also extract service names
$servicePattern = 'service\s+(\w+)\s*\{'
$serviceMatches = [regex]::Matches($content, $servicePattern)
Write-Host ""
Write-Host "=== SERVICES: $($serviceMatches.Count) ==="
foreach ($s in $serviceMatches) {
    Write-Host "service $($s.Groups[1].Value)"
}
