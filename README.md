# AeroDoc

AeroDoc is a lightweight desktop document app for quick reading and simple edits when a full office suite is not available. It opens local folders as a file tree and supports Markdown, PDF, DOCX, XLSX, and CSV files.

## Features

- Browse a local folder and its subfolders.
- Read and edit Markdown files with GitHub-flavored Markdown preview.
- Read PDF files through the built-in viewer.
- Preview DOCX files and save simplified plain-text DOCX output.
- Open XLSX and CSV files in a simple editable grid.
- Work locally; files stay on your machine unless you sync them yourself.

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

## Project Structure

- `src/` - React application, document loading, editing, and UI.
- `src-tauri/` - Tauri configuration, Rust commands, file association, and filesystem scope handling.
- `public/` - static web assets.
- `dist/` - generated frontend build output, not committed.

## License

MIT
