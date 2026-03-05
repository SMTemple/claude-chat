# Create desktop and Start Menu shortcuts for Claude Chat
$projectDir = Join-Path $env:USERPROFILE 'claude-chat'
$electronExe = Join-Path $projectDir 'node_modules\electron\dist\electron.exe'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$startMenuPath = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'

$shell = New-Object -ComObject WScript.Shell

# Desktop shortcut
$desktopShortcut = $shell.CreateShortcut("$desktopPath\Claude Chat.lnk")
$desktopShortcut.TargetPath = $electronExe
$desktopShortcut.Arguments = "."
$desktopShortcut.WorkingDirectory = $projectDir
$desktopShortcut.Description = "Claude Chat - Desktop interface for Claude Code"
$desktopShortcut.Save()
Write-Host "Desktop shortcut created"

# Start Menu shortcut (for taskbar pinning)
$startShortcut = $shell.CreateShortcut("$startMenuPath\Claude Chat.lnk")
$startShortcut.TargetPath = $electronExe
$startShortcut.Arguments = "."
$startShortcut.WorkingDirectory = $projectDir
$startShortcut.Description = "Claude Chat - Desktop interface for Claude Code"
$startShortcut.Save()
Write-Host "Start Menu shortcut created"
Write-Host ""
Write-Host "To pin to taskbar: Right-click the desktop shortcut > 'Show more options' > 'Pin to taskbar'"
