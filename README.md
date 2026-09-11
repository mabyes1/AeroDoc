# AeroDoc

AeroDoc is a local-first desktop document workspace for reading and light editing. It opens local folders as a file tree and supports Markdown, PDF, DOCX, XLSX, CSV, plain text, and common code files.

## Features

### Reading
- Browse a local folder and its subfolders.
- Markdown preview with GitHub-flavored Markdown, table of contents, wiki links, and reading progress.
- Real PDF viewer powered by pdf.js: continuous pages, zoom, fit-width, page navigation, and in-document search (`Ctrl+F`).
- DOCX HTML preview sanitized with DOMPurify.
- Code and plain-text files with syntax highlighting.
- Multi-tab document workspace with Back/Forward navigation history.
- Full-text search across the vault and a command palette (`Ctrl+P`).

### Editing
- Markdown split editor/preview and optional auto-save.
- Spreadsheet grid with range selection, copy/paste, and formula-aware XLSX save.
- Quick create/delete for files and folders.
- Text/code editing with save.

### Workspace
- Collapse/resize sidebar, recent vault, recent files.
- Color themes: Gemini, Claude, Sakura, Dark.
- Interface language: 繁體中文 / English.
- Highlights/annotations stored locally per file.
- Work locally; files stay on your machine unless you sync them yourself.

## Keyboard Shortcuts

- `Ctrl+O` — open folder
- `Ctrl+K` — focus file search
- `Ctrl+P` — command palette / full-text search (`?query`)
- `Ctrl+B` — toggle sidebar
- `Ctrl+E` — enter/leave text editing
- `Ctrl+S` — save current document
- `Ctrl+F` — search inside PDF
- `Ctrl+Alt+←/→` — back / forward
- `Ctrl+C` / `Ctrl+V` — copy/paste spreadsheet range
- `Esc` — cancel edit / close palette

## Current Limitations

AeroDoc stays intentionally lightweight. DOCX saving rewrites paragraph text inside the original package (styles/images preserved when possible) and always writes a one-time `.aerodoc.bak` backup. XLSX saving preserves sheet names, cell values, and simple formulas; charts and macros are not a goal. PDF remains read-only except for local highlights.

On first launch you can choose which file extensions AeroDoc registers as the default handler (HKCU, no admin).

## Development

Requirements:

- Node.js and npm
- Rust toolchain
- Tauri desktop prerequisites for your operating system

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
- **One-click Installer Script**: Run `install.bat` (or `install.ps1` via PowerShell) to build, copy the program to your Local Programs directory, and configure file associations under `HKCU`.
- **Standalone Setup EXE**: Run `npx tauri build` to compile the NSIS installer.

## Project Structure

- `src/` — React application (store, components, viewers, lib, i18n).
- `src-tauri/` — Tauri configuration, Rust commands, file association, filesystem scope.
- `public/` — static web assets.
- `dist/` — generated frontend build output.

## License

MIT
