# Simple PowerShell script to generate a .dxt file for the YNAB MCP Server
# A .dxt file is just a compressed archive with the built server and metadata

param(
    [string]$OutputDir = "dist"
)

Write-Host "Generating YNAB MCP Server .dxt package..." -ForegroundColor Green

# Configuration
$PackageName = "ynab-mcp-server"
$PackageJson = Get-Content "package.json" | ConvertFrom-Json
$Version = $PackageJson.version
$DxtFile = "$PackageName-$Version.dxt"

# Ensure we have a built version
if (-not (Test-Path "dist/index.js")) {
    Write-Host "❌ Build not found. Running build first..." -ForegroundColor Red
    npm run build:prod
}

# Create temporary package directory
$TempDir = Join-Path $env:TEMP "ynab-mcp-$(Get-Random)"
$PackageDir = Join-Path $TempDir "package"
New-Item -ItemType Directory -Path $PackageDir -Force | Out-Null

Write-Host "Packaging files..." -ForegroundColor Yellow

# Copy essential files
Copy-Item -Recurse "dist" "$PackageDir/"
Copy-Item "package.json" "$PackageDir/"
Copy-Item "README.md" "$PackageDir/"
if (Test-Path "LICENSE") { Copy-Item "LICENSE" "$PackageDir/" }
if (Test-Path "docs") { Copy-Item -Recurse "docs" "$PackageDir/" }

# Create simple manifest
$Manifest = @{
    name = $PackageName
    version = $Version
    description = "Model Context Protocol server for YNAB integration"
    main = "dist/index.js"
    type = "mcp-server"
    requiredEnv = @("YNAB_ACCESS_TOKEN")
} | ConvertTo-Json -Depth 3

$Manifest | Out-File -FilePath "$PackageDir/manifest.json" -Encoding UTF8

# Create MCP config template
$McpConfig = @{
    mcpServers = @{
        $PackageName = @{
            command = "node"
            args = @("dist/index.js")
            env = @{
                YNAB_ACCESS_TOKEN = "your_token_here"
            }
        }
    }
} | ConvertTo-Json -Depth 4

$McpConfig | Out-File -FilePath "$PackageDir/mcp-config.json" -Encoding UTF8

# Create the .dxt file (zip archive)
Write-Host "Creating .dxt archive..." -ForegroundColor Yellow
$DxtPath = Join-Path $OutputDir $DxtFile

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Create zip archive (Windows equivalent of tar.gz)
Compress-Archive -Path "$PackageDir\*" -DestinationPath $DxtPath -Force

# Cleanup
Remove-Item -Recurse -Force $TempDir

# Get file size
if (Test-Path $DxtPath) {
    $FileSize = (Get-Item $DxtPath).Length
    $FileSizeKB = [math]::Round($FileSize / 1KB, 1)
} else {
    $FileSizeKB = 0
}

Write-Host "Created $DxtPath" -ForegroundColor Green
Write-Host "Size: $FileSizeKB KB" -ForegroundColor Cyan
Write-Host ""
Write-Host "To install:" -ForegroundColor Yellow
Write-Host "1. Extract: Expand-Archive $DxtFile" -ForegroundColor White
Write-Host "2. Set YNAB_ACCESS_TOKEN environment variable" -ForegroundColor White
Write-Host "3. Add to Claude Desktop MCP config" -ForegroundColor White