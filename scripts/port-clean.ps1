param([int]$Port = 8888)

$pids = netstat -ano |
    Where-Object { $_ -match '^\s*(TCP|UDP)\s+' } |
    ForEach-Object {
        $columns = $_.Trim() -split '\s+'
        $localAddress = $columns[1]
        $processId = $columns[-1]

        if ($localAddress -match "[:.]$Port$" -and $processId -match '^\d+$' -and [int]$processId -gt 0) {
            [int]$processId
        }
    } |
    Sort-Object -Unique

if ($pids.Count -eq 0) {
    Write-Host "Port $Port is not in use."
    exit 0
}

foreach ($processId in $pids) {
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Killed PID $processId on port $Port"
    }
    catch {
        Write-Error "Failed to kill PID $processId on port ${Port}: $($_.Exception.Message)"
        exit 1
    }
}
