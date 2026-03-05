$env:ELECTRON_IS_DEV = '1'
# CLEAR CONFLICTING ENV VARS
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# Start Vite in background
$viteJob = Start-Job -ScriptBlock {
    Set-Location 'C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat'
    & ".\node_modules\.bin\vite.cmd" --port 5173
}

Write-Host "Waiting for Vite to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Try to find which port Vite started on
$out = Receive-Job $viteJob -Keep
$port = 5173
if ($out -match "http://localhost:(\d+)") {
    $port = $matches[1]
    Write-Host "Vite detected on port $port" -ForegroundColor Green
}
else {
    Write-Host "Could not detect Vite port from output, defaulting to 5173" -ForegroundColor Yellow
}

# Ping Vite
$viteOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$port" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "Vite OK - HTTP $($resp.StatusCode)" -ForegroundColor Green
    $viteOk = $true
}
catch {
    Write-Host "Vite did not respond on port $port!" -ForegroundColor Red
}

if (-not $viteOk) {
    Stop-Job $viteJob | Out-Null
    Remove-Job $viteJob | Out-Null
    Write-Host "Aborting smoke test - Vite failed to start." -ForegroundColor Red
    exit 1
}

# Launch Electron
Write-Host "Launching Electron..." -ForegroundColor Cyan
$stdoutFile = "C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat\smoke_stdout.txt"
$stderrFile = "C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat\smoke_stderr.txt"

# Ensure files exist
"" | Out-File $stdoutFile
"" | Out-File $stderrFile

$electronExe = "C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat\node_modules\electron\dist\electron.exe"

$proc = Start-Process `
    -FilePath $electronExe `
    -ArgumentList "." `
    -PassThru `
    -RedirectStandardError $stderrFile `
    -RedirectStandardOutput $stdoutFile

Write-Host "Electron PID: $($proc.Id)" -ForegroundColor Green
Start-Sleep -Seconds 10

$exited = $proc.HasExited
if (-not $exited) {
    Write-Host "PASS - Electron is still running after 10s" -ForegroundColor Green
}
else {
    Write-Host "FAIL - Electron exited early (exit code: $($proc.ExitCode))" -ForegroundColor Red
}

if (Test-Path $stderrFile) {
    $errContent = (Get-Content $stderrFile -Raw)
    if ($errContent -and $errContent.Trim()) {
        Write-Host "--- Electron STDERR ---" -ForegroundColor Yellow
        Write-Host $errContent.Trim()
    }
}

if (Test-Path $stdoutFile) {
    $outContent = (Get-Content $stdoutFile -Raw)
    if ($outContent -and $outContent.Trim()) {
        Write-Host "--- Electron STDOUT ---" -ForegroundColor Cyan
        Write-Host $outContent.Trim()
    }
}

# Cleanup
if (-not $proc.HasExited) { $proc.Kill() }
Stop-Job $viteJob | Out-Null
Remove-Job $viteJob | Out-Null
Remove-Item $stdoutFile -ErrorAction SilentlyContinue
Remove-Item $stderrFile -ErrorAction SilentlyContinue
Write-Host "Smoke test done." -ForegroundColor Cyan
