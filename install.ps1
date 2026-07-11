# AeroDoc Windows Installer & File Association Setup
# Written for Ken by Mira (Antigravity CLI Assistant)

$ErrorActionPreference = "Stop"

# Define ASCII Banner
Clear-Host
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "             AeroDoc Desktop Installer            " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " This script will build, install, and associate    "
Write-Host " AeroDoc with your preferred file extensions.     "
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host

# 1. Ask to build the release binary
$buildChoice = Read-Host "Do you want to build a fresh release of AeroDoc? (y/n) [Default: y]"
if ($null -eq $buildChoice -or $buildChoice.Trim() -eq "") { $buildChoice = "y" }

if ($buildChoice.ToLower() -eq "y" -or $buildChoice.ToLower() -eq "yes") {
    Write-Host "`n[1/3] Building AeroDoc release binary..." -ForegroundColor Yellow
    # Check if npm is installed and node_modules exist
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies first..." -ForegroundColor Gray
        npm install
    }
    # Run tauri build
    npx tauri build
    Write-Host "✓ Build successful!" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build step (using existing binary)..." -ForegroundColor Yellow
}

# Locate binary
$sourceBinPath = Join-Path (Get-Item .).FullName "src-tauri\target\release\AeroDoc.exe"
if (-not (Test-Path $sourceBinPath)) {
    # Fallback to dev binary or check lower case
    $sourceBinPath = Join-Path (Get-Item .).FullName "src-tauri\target\release\aerodoc.exe"
}

if (-not (Test-Path $sourceBinPath)) {
    Write-Host "`nError: Could not find AeroDoc.exe at expected location: src-tauri\target\release\AeroDoc.exe" -ForegroundColor Red
    Write-Host "Please build the project first using 'npm run build' or select 'y' for build." -ForegroundColor Red
    exit 1
}

# 2. Define installation directory
$defaultInstallDir = "$env:USERPROFILE\AppData\Local\Programs\AeroDoc"
$installDirInput = Read-Host "Enter installation folder [Default: $defaultInstallDir]"
$installDir = if ($null -eq $installDirInput -or $installDirInput.Trim() -eq "") { $defaultInstallDir } else { $installDirInput.Trim() }

Write-Host "`n[2/3] Installing files to: $installDir ..." -ForegroundColor Yellow
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# Copy binary to destination
$destBinPath = Join-Path $installDir "AeroDoc.exe"
Copy-Item $sourceBinPath $destBinPath -Force
Write-Host "✓ Copy successful!" -ForegroundColor Green

# 3. File Association Configuration
Write-Host "`n[3/3] Configure File Associations..." -ForegroundColor Yellow
$extensions = @(".md", ".pdf", ".docx", ".xlsx", ".csv")
$selectedExtensions = @()

Write-Host "Please select which file extensions to open with AeroDoc by default:"
foreach ($ext in $extensions) {
    $choice = Read-Host "Associate $ext ? (y/n) [Default: y]"
    if ($null -eq $choice -or $choice.Trim() -eq "" -or $choice.ToLower() -eq "y" -or $choice.ToLower() -eq "yes") {
        $selectedExtensions += $ext
    }
}

if ($selectedExtensions.Count -eq 0) {
    Write-Host "No extensions selected. Skipping file association." -ForegroundColor Gray
} else {
    Write-Host "`nRegistering registry entries under HKCU\Software\Classes..." -ForegroundColor Gray
    
    # 3.1 Register ProgID
    $progIdPath = "HKCU:\Software\Classes\AeroDoc.Document"
    if (-not (Test-Path $progIdPath)) { New-Item -Path $progIdPath -Force | Out-Null }
    Set-ItemProperty -Path $progIdPath -Name "(Default)" -Value "AeroDoc Document"
    
    $iconPath = Join-Path $progIdPath "DefaultIcon"
    if (-not (Test-Path $iconPath)) { New-Item -Path $iconPath -Force | Out-Null }
    Set-ItemProperty -Path $iconPath -Name "(Default)" -Value "$destBinPath,0"
    
    $commandPath = Join-Path $progIdPath "shell\open\command"
    if (-not (Test-Path $commandPath)) { New-Item -Path $commandPath -Force | Out-Null }
    Set-ItemProperty -Path $commandPath -Name "(Default)" -Value "`"$destBinPath`" `"%1`""
    
    # 3.2 Associate each chosen extension
    foreach ($ext in $selectedExtensions) {
        Write-Host "  Associating $ext ..." -ForegroundColor Gray
        
        # User classes root extension
        $extPath = "HKCU:\Software\Classes\$ext"
        if (-not (Test-Path $extPath)) { New-Item -Path $extPath -Force | Out-Null }
        Set-ItemProperty -Path $extPath -Name "(Default)" -Value "AeroDoc.Document"
        
        # OpenWithProgids link
        $openWithPath = Join-Path $extPath "OpenWithProgids"
        if (-not (Test-Path $openWithPath)) { New-Item -Path $openWithPath -Force | Out-Null }
        Set-ItemProperty -Path $openWithPath -Name "AeroDoc.Document" -Value ""
        
        # Explorer user choices
        $explorerPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids"
        if (-not (Test-Path $explorerPath)) { New-Item -Path $explorerPath -Force | Out-Null }
        Set-ItemProperty -Path $explorerPath -Name "AeroDoc.Document" -Value ([byte[]]@())
    }
}

# 4. Generate the uninstaller script
Write-Host "`nGenerating uninstaller script in installation folder..." -ForegroundColor Gray
$uninstallScriptContent = @"
# AeroDoc Windows Uninstaller
# Written for Ken by Mira (Antigravity CLI Assistant)

`$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "             AeroDoc Desktop Uninstaller          " -ForegroundColor Red
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host

# 1. Clean up file associations in Registry
Write-Host "Cleaning up registry entries..." -ForegroundColor Yellow
`$progIdPath = "HKCU:\Software\Classes\AeroDoc.Document"
if (Test-Path `$progIdPath) {
    Remove-Item -Path `$progIdPath -Recurse -Force
}

`$extensions = @(".md", ".pdf", ".docx", ".xlsx", ".csv")
foreach (`$ext in `$extensions) {
    # Check if this extension is associated with AeroDoc
    `$extPath = "HKCU:\Software\Classes\`$ext"
    if (Test-Path `$extPath) {
        `$defaultVal = (Get-ItemProperty -Path `$extPath -Name "(Default)" -ErrorAction SilentlyContinue)."(Default)"
        if (`$defaultVal -eq "AeroDoc.Document") {
            # Reset or remove the default ProgID link
            Remove-ItemProperty -Path `$extPath -Name "(Default)" -Force -ErrorAction SilentlyContinue
        }
        `$openWithPath = Join-Path `$extPath "OpenWithProgids"
        if (Test-Path `$openWithPath) {
            Remove-ItemProperty -Path `$openWithPath -Name "AeroDoc.Document" -Force -ErrorAction SilentlyContinue
        }
    }
    
    `$explorerPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\`$ext\OpenWithProgids"
    if (Test-Path `$explorerPath) {
        Remove-ItemProperty -Path `$explorerPath -Name "AeroDoc.Document" -Force -ErrorAction SilentlyContinue
    }
}

# 2. Remove from Windows Add/Remove Programs
`$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AeroDoc"
if (Test-Path `$uninstallKey) {
    Remove-Item -Path `$uninstallKey -Recurse -Force
}

# 3. Refresh Windows Shell to update file icons
Write-Host "Refreshing Windows Shell..." -ForegroundColor Yellow
`$code = '[DllImport("shell32.dll", CharSet=CharSet.Auto, SetLastError=true)] public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);'
`$type = Add-Type -MemberDefinition `$code -Name Shell32Helper -Namespace Win32API -PassThru
`$type::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

# 4. Remove files
Write-Host "Removing program files..." -ForegroundColor Yellow
`$programFolder = "`$PSScriptRoot"
# Schedule folder self-deletion after script exit
Start-Process cmd.exe -ArgumentList "/c timeout /t 2 & rmdir /s /q `"`$programFolder`"" -WindowStyle Hidden

Write-Host "✓ AeroDoc has been successfully uninstalled!" -ForegroundColor Green
"@

$uninstallScriptPath = Join-Path $installDir "uninstall.ps1"
Set-Content -Path $uninstallScriptPath -Value $uninstallScriptContent -Encoding utf8

# 5. Register in Windows Add/Remove Programs
Write-Host "Registering in Windows Add/Remove Programs..." -ForegroundColor Gray
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AeroDoc"
if (-not (Test-Path $uninstallKey)) { New-Item -Path $uninstallKey -Force | Out-Null }
Set-ItemProperty -Path $uninstallKey -Name "DisplayName" -Value "AeroDoc Reader & Editor"
Set-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -Value "0.1.0"
Set-ItemProperty -Path $uninstallKey -Name "Publisher" -Value "Ken Chen"
Set-ItemProperty -Path $uninstallKey -Name "InstallLocation" -Value $installDir
Set-ItemProperty -Path $uninstallKey -Name "UninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -File `"$uninstallScriptPath`""
Set-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -Value $destBinPath

# 6. Refresh Windows Shell
Write-Host "Refreshing Windows Shell..." -ForegroundColor Yellow
$code = '[DllImport("shell32.dll", CharSet=CharSet.Auto, SetLastError=true)] public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);'
$type = Add-Type -MemberDefinition $code -Name Shell32Helper -Namespace Win32API -PassThru
$type::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host " ✓ AeroDoc Installer completed successfully!      " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Install Location: $installDir"
Write-Host " Associated Exts:  $($selectedExtensions -join ', ')"
Write-Host " You can now double-click these files to open them"
Write-Host " in AeroDoc, or manage default apps in Windows!"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host
