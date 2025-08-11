# PowerShell script to watch for file changes and restart MCP
param(
    [string]$Path = ".\src",
    [string]$Filter = "*.ts",
    [int]$RestartDelay = 3
)

Write-Host "🔍 Watching for changes in: $Path"
Write-Host "📁 Filter: $Filter"

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = Resolve-Path $Path
$watcher.Filter = $Filter
$watcher.EnableRaisingEvents = $true
$watcher.IncludeSubdirectories = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    Write-Host "🔄 File $changeType`: $path"
    
    # Build the project
    Write-Host "🏗️  Building project..."
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Build successful"
        Start-Sleep -Seconds $RestartDelay
        
        Write-Host "🔄 Reconnecting to YNAB MCP server..."
        /mcp reconnect ynab-mcp-server
        Start-Sleep -Seconds 1
        /mcp reconnect ynab-mcp-server
        Write-Host "✅ MCP server reconnected"
    } else {
        Write-Host "❌ Build failed, skipping MCP restart"
    }
}

Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $action
Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $action

try {
    Write-Host "✅ File watcher started. Press Ctrl+C to stop."
    while ($true) { Start-Sleep 1 }
}
finally {
    $watcher.Dispose()
    Write-Host "👋 File watcher stopped"
}