# PowerShell script to generate a .dxt file using the official Anthropic DXT CLI

param(
    [string]$OutputDir = "dist"
)

Write-Host "Generating YNAB MCP Server .dxt package using official CLI..." -ForegroundColor Green

# Configuration
$PackageJson = Get-Content "package.json" | ConvertFrom-Json
$PackageName = $PackageJson.name
$Version = $PackageJson.version

# Ensure we have a built version
if (-not (Test-Path "dist/index.js")) {
    Write-Host "❌ Build not found. Running build first..." -ForegroundColor Red
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
}

# Check if official DXT CLI is installed
try {
    $dxtVersion = & dxt --version
    Write-Host "✅ Using DXT CLI version: $dxtVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ DXT CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @anthropic-ai/dxt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install DXT CLI!" -ForegroundColor Red
        exit 1
    }
}

# Ensure manifest.json exists and is valid
if (-not (Test-Path "manifest.json")) {
    Write-Host "❌ manifest.json not found. Creating one..." -ForegroundColor Yellow
    & dxt init -y
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create manifest!" -ForegroundColor Red
        exit 1
    }
}

# Validate the manifest
Write-Host "Validating manifest..." -ForegroundColor Yellow
& dxt validate manifest.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Manifest validation failed!" -ForegroundColor Red
    exit 1
}

# Pack the DXT using official CLI
Write-Host "Packing DXT file..." -ForegroundColor Yellow
$DxtFile = "$PackageName-$Version.dxt"
$OutputPath = Join-Path $OutputDir $DxtFile

& dxt pack . $OutputPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ DXT packing failed!" -ForegroundColor Red
    exit 1
}

# Get file size
if (Test-Path $OutputPath) {
    $FileSize = (Get-Item $OutputPath).Length
    $FileSizeKB = [math]::Round($FileSize / 1KB, 1)
    $FileSizeMB = [math]::Round($FileSize / 1MB, 1)
    
    Write-Host "✅ Created $OutputPath" -ForegroundColor Green
    Write-Host "📦 Size: $FileSizeKB KB ($FileSizeMB MB)" -ForegroundColor Cyan
} else {
    Write-Host "❌ DXT file was not created!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Installation Instructions:" -ForegroundColor Yellow
Write-Host "1. Drag and drop the .dxt file into Claude Desktop" -ForegroundColor White
Write-Host "2. Set YNAB_ACCESS_TOKEN environment variable" -ForegroundColor White
Write-Host "3. Restart Claude Desktop" -ForegroundColor White