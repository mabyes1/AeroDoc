@echo off
echo ============================================
echo   Starting AeroDoc Desktop App...
echo ============================================
echo.

cd /d "%~dp0"

echo [1/1] Starting Tauri development environment...
echo First launch may take a minute while Rust dependencies compile.
start "AeroDoc Tauri" npx tauri dev

echo.
echo ============================================
echo   AeroDoc desktop app is starting...
echo   Keep the "AeroDoc Tauri" window open.
echo ============================================
pause
