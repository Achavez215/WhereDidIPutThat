$env:ELECTRON_IS_DEV = '1'
$electronExe = '.\node_modules\electron\dist\electron.exe'

Write-Host "Launching Electron (DEV mode)..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $electronExe -ArgumentList '.' -PassThru

Write-Host "Electron PID: $($proc.Id)" -ForegroundColor Green
Write-Host "Waiting 12s to check stability..."
Start-Sleep -Seconds 12

if ($proc.HasExited) {
    Write-Host "FAIL - Electron exited early! Exit code: $($proc.ExitCode)" -ForegroundColor Red
}
else {
    Write-Host "PASS - Electron is still running after 12s" -ForegroundColor Green
    Write-Host "Leaving app open for you to interact with."
}
