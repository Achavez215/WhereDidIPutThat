# create-test-data.ps1
# Generates a sample folder structure with dummy files for testing WhereDidIPutThat

$testRoot = Join-Path $PSScriptRoot "WDIPT_Test_Environment"
$sourceDir = Join-Path $testRoot "Source_Messy_Folder"
$destDir = Join-Path $testRoot "Destination_Organized"

Write-Host "Creating test environment at: $testRoot" -ForegroundColor Cyan

# Cleanup old test data
if (Test-Path $testRoot) {
    Remove-Item -Path $testRoot -Recurse -Force
}

# Create directories
New-Item -ItemType Directory -Path $sourceDir -Force | Out-Null
New-Item -ItemType Directory -Path $destDir -Force | Out-Null

# Define categories and extensions
$categories = @{
    "images"    = @(".jpg", ".png", ".gif")
    "documents" = @(".pdf", ".docx", ".txt")
    "videos"    = @(".mp4", ".mov")
    "archives"  = @(".zip", ".rar")
}

# Create dummy files in messy folder
foreach ($cat in $categories.Keys) {
    $exts = $categories[$cat]
    for ($i = 1; $i -le 5; $i++) {
        $ext = $exts[($i % $exts.Count)]
        $fileName = "test_file_$($cat)_$($i)$($ext)"
        $filePath = Join-Path $sourceDir $fileName
        
        # Create a file with some content
        "This is a dummy $($cat) file for testing WhereDidIPutThat." | Out-File -FilePath $filePath -Encoding utf8
    }
}

# Create some subfolders with more "mess"
$subFolder = New-Item -ItemType Directory -Path (Join-Path $sourceDir "Old_Backups_2023") -Force
"Hidden important doc" | Out-File -FilePath (Join-Path $subFolder "secret_notes.pdf")

Write-Host "Test data created successfully!" -ForegroundColor Green
Write-Host "Source: $sourceDir"
Write-Host "Destination: $destDir"
Write-Host "You can now select these folders in the app."
