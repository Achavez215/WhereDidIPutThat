$env:ELECTRON_IS_DEV = '1'

# Start Vite in background
$viteJob = Start-Job -ScriptBlock {
    Set-Location 'C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat'
    & ".\node_modules\.bin\vite.cmd" --port 5173
}

Write-Host "Waiting for Vite on port 5173..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Ping Vite
$viteOk = $false
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "Vite OK - HTTP $($resp.StatusCode)" -ForegroundColor Green
    $viteOk = $true
} catch {
    Write-Host "Vite did not respond!" -ForegroundColor Red
    Receive-Job $viteJob | ForEach-Object { Write-Host $_ }
}

if (-not $viteOk) {
    Stop-Job $viteJob | Out-Null
    Remove-Job $viteJob | Out-Null
    Write-Host "Aborting smoke test - Vite failed to start." -ForegroundColor Red
    exit 1
}

# Launch Electron
Write-Host "Launching Electron..." -ForegroundColor Cyan
$stdoutFile = ".\smoke_stdout.txt"
$stderrFile = ".\smoke_stderr.txt"

$proc = Start-Process `
    -FilePath ".\node_modules\electron\dist\electron.exe" `
    -ArgumentList "." `
    -PassThru `
    -RedirectStandardError $stderrFile `
    -RedirectStandardOutput $stdoutFile

Write-Host "Electron PID: $($proc.Id)" -ForegroundColor Green
Start-Sleep -Seconds 10

$exited = $proc.HasExited
if (-not $exited) {
    Write-Host "PASS - Electron is still running after 10s" -ForegroundColor Green
} else {
    Write-Host "FAIL - Electron exited early (exit code: $($proc.ExitCode))" -ForegroundColor Red
}

if (Test-Path $stderrFile) {
    $errContent = (Get-Content $stderrFile -Raw).Trim()
    if ($errContent) {
        Write-Host "--- Electron STDERR ---" -ForegroundColor Yellow
        Write-Host $errContent
    } else {
        Write-Host "Stderr: clean (no errors)" -ForegroundColor Green
    }
}

if (Test-Path $stdoutFile) {
    $outContent = (Get-Content $stdoutFile -Raw).Trim()
    if ($outContent) {
        Write-Host "--- Electron STDOUT ---" -ForegroundColor Cyan
        Write-Host $outContent
    }
}

# Cleanup
if (-not $proc.HasExited) { $proc.Kill() }
Stop-Job $viteJob | Out-Null
Remove-Job $viteJob | Out-Null
Remove-Item $stdoutFile -ErrorAction SilentlyContinue
Remove-Item $stderrFile -ErrorAction SilentlyContinue
Write-Host "Smoke test done." -ForegroundColor Cyan
