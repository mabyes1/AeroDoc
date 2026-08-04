# AeroDoc

AeroDoc is a lightweight desktop document app for quick reading and simple edits when a full office suite is not available. It opens local folders as a file tree and supports Markdown, PDF, DOCX, XLSX, and CSV files.

## Features

- Browse a local folder and its subfolders.
- Read and edit Markdown files with GitHub-flavored Markdown preview.
- Use a live split editor/preview layout for Markdown.
- Read PDF files through the built-in viewer.
- Preview DOCX files and save simplified plain-text DOCX output.
- Open XLSX and CSV files in an editable, virtualized grid.
- Drag across spreadsheet cells to select a rectangular range, then copy or paste tabular data with standard shortcuts.
- Collapse or resize the workspace sidebar and quickly reopen the most recent folder.
- Work locally; files stay on your machine unless you sync them yourself.

## Keyboard Shortcuts

- `Ctrl+O` - open a folder.
- `Ctrl+K` - focus file search.
- `Ctrl+B` - show or hide the sidebar.
- `Ctrl+E` - enter or leave text editing for Markdown and DOCX.
- `Ctrl+S` - save the current document.
- `Ctrl+C` / `Ctrl+V` - copy or paste the selected spreadsheet range.

Spreadsheet rendering is virtualized, so AeroDoc only mounts cells near the visible viewport. DOCX, XLSX, CSV, and export libraries are also loaded on demand instead of being included in the initial application bundle.

## Current Limitations

AeroDoc is intentionally lightweight. DOCX saving rewrites the file as a simplified text document and does not preserve advanced formatting, images, comments, or tracked changes. XLSX saving preserves sheet names and cell values, but complex formatting, formulas, charts, and macros are not a goal. PDF is read-only.

## Development

Requirements:

- Node.js and npm
- Rust toolchain
- Tauri desktop prerequisites for your operating system

Common commands:

```powershell
npm install
npm run dev
npm run build
npx tauri dev
npx tauri build
```

Use `npm run dev` for the Vite frontend only. Use `npx tauri dev` when testing filesystem access, file associations, drag-and-drop, or desktop behavior.

## Installation & Setup

For standard installation on Windows:
- **One-click Installer Script**: Run `install.bat` (or `install.ps1` via PowerShell) to build, copy the program to your Local Programs directory, and automatically configure file associations (`.md`, `.pdf`, `.docx`, `.xlsx`, `.csv`) under `HKCU` (no admin privileges required).
- **Standalone Setup EXE**: Run `npx tauri build` to compile a professional GUI installer wizard:
  `src-tauri/target/release/bundle/nsis/AeroDoc_0.1.0_x64-setup.exe`

## Project Structure

- `src/` - React application, document loading, editing, and UI.
- `src-tauri/` - Tauri configuration, Rust commands, file association, and filesystem scope handling.
- `public/` - static web assets.
- `dist/` - generated frontend build output, not committed.
- `install.ps1` / `install.bat` - custom Windows local script installer.

## License

MIT
