$env:ELECTRON_IS_DEV = '1'

# Start Vite in background
$viteJob = Start-Job -ScriptBlock {
    Set-Location 'C:\Users\omg\OneDrive\Credit_Dispute_Letters\Desktop\WhereDidIPutThat'
    & powershell -ExecutionPolicy Bypass -Command "& '.\node_modules\.bin\vite.cmd' --port 5173"
}

# Wait for Vite to be ready
Write-Host "Waiting for Vite to start..."
Start-Sleep -Seconds 4

# Launch Electron
Write-Host "Launching Electron..."
& '.\node_modules\electron\dist\electron.exe' . 2>&1

Stop-Job $viteJob
Remove-Job $viteJob
