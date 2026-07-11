@echo off
cd /d "%~dp0"
echo Starting AeroDoc Installer in PowerShell...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "install.ps1"
pause
