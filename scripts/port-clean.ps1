param([int]$Port = 8888)

$lines = netstat -ano | Where-Object { $_ -match ":$Port\s" }
$pids = $lines | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique

if ($pids.Count -eq 0) {
    Write-Host "Port $Port is not in use."
    exit 0
}

foreach ($processId in $pids) {
    Stop-Process -Id $processId -Force
    Write-Host "Killed PID $processId on port $Port"
}
