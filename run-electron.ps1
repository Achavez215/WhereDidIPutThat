$env:ELECTRON_IS_DEV = '1'
$electronExe = '.\node_modules\electron\dist\electron.exe'
$stdoutFile = '.\electron_stdout.txt'
$stderrFile = '.\electron_stderr.txt'

if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -Force }
if (Test-Path $stderrFile) { Remove-Item $stderrFile  -Force }

Write-Host "Launching Electron (DEV mode)..." -ForegroundColor Cyan
$proc = Start-Process `
    -FilePath $electronExe `
    -ArgumentList '.' `
    -PassThru `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError  $stderrFile

Write-Host "Electron PID: $($proc.Id)"
$proc.WaitForExit(20000) | Out-Null

Write-Host "Exit code: $($proc.ExitCode)"

Write-Host "=== STDOUT ===" -ForegroundColor Cyan
if (Test-Path $stdoutFile) { Get-Content $stdoutFile } else { Write-Host "(empty)" }

Write-Host "=== STDERR ===" -ForegroundColor Yellow
if (Test-Path $stderrFile) { Get-Content $stderrFile } else { Write-Host "(empty)" }
