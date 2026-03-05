$env:ELECTRON_IS_DEV = '1'

# Start Vite in background
$viteJob = Start-Job -ScriptBlock {
    Set-Location 'C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat'
    & ".\node_modules\.bin\vite.cmd" --port 5173
}

Write-Host "Waiting for Vite to start on port 5173..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Try to hit the Vite server
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 5 -UseBasicParsing
    Write-Host ("Vite server OK — HTTP " + $resp.StatusCode) -ForegroundColor Green
} catch {
    Write-Host "Vite server did not respond — checking job output:" -ForegroundColor Red
    Receive-Job $viteJob | Write-Host
}

# Launch Electron and capture output
Write-Host "Launching Electron..." -ForegroundColor Cyan
$proc = Start-Process `
    -FilePath ".\node_modules\electron\dist\electron.exe" `
    -ArgumentList "." `
    -PassThru `
    -RedirectStandardError "$PSScriptRoot\smoke_stderr.txt" `
    -RedirectStandardOutput "$PSScriptRoot\smoke_stdout.txt"

Write-Host ("Electron started — PID: " + $proc.Id) -ForegroundColor Green
Start-Sleep -Seconds 10

$exited = $proc.HasExited
Write-Host ("Electron still running: " + (-not $exited)) -ForegroundColor $(if (-not $exited) { 'Green' } else { 'Red' })

if (Test-Path "$PSScriptRoot\smoke_stderr.txt") {
    $err = Get-Content "$PSScriptRoot\smoke_stderr.txt" -Raw
    if ($err.Trim()) {
        Write-Host "--- Electron STDERR ---" -ForegroundColor Yellow
        Write-Host $err
    } else {
        Write-Host "No stderr output (clean)" -ForegroundColor Green
    }
}

if (Test-Path "$PSScriptRoot\smoke_stdout.txt") {
    $out = Get-Content "$PSScriptRoot\smoke_stdout.txt" -Raw
    if ($out.Trim()) {
        Write-Host "--- Electron STDOUT ---" -ForegroundColor Cyan
        Write-Host $out
    }
}

# Cleanup
Write-Host "Shutting down..." -ForegroundColor Gray
if (-not $proc.HasExited) { $proc.Kill() }
Stop-Job $viteJob | Out-Null
Remove-Job $viteJob | Out-Null
Write-Host "Smoke test complete." -ForegroundColor Cyan
