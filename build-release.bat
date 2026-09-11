@echo off
setlocal

set RUSTUP_HOME=D:\dev\rust\rustup
set CARGO_HOME=D:\dev\rust\cargo
set PATH=D:\dev\rust\cargo\bin;%PATH%

call "D:\dev\vsbuild\VC\Auxiliary\Build\vcvars64.bat" >nul

cd /d D:\coding-tools-mcp\AeroDoc

echo === cargo check ===
cargo --version
rustc --version
where link

echo === tauri build ===
npx tauri build
echo BUILD_EXIT=%ERRORLEVEL%
