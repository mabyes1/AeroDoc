# AeroDoc - Architecture and Troubleshooting Notes

This file records implementation details that are useful when maintaining the Tauri desktop app.

## Core Architecture

### Multi-Window Document Handling

AeroDoc does not enforce a single-instance process model. When the operating system opens a supported document through file association, the app starts normally and sends the document path to the frontend after the webview is ready. This avoids stale lock-file and IPC edge cases.

### Tauri Filesystem Scope

Tauri v2 requires explicit filesystem permissions. The Rust side adds opened files and their parent directories to the filesystem scope before the React app reads them. When a user opens a folder from the UI, the frontend calls `allow_vault_scope` so subfolders can be scanned and opened.

### Event-Driven Loading

All external file opens go through the same event:

```text
document-file-opened
```

The Rust entrypoint emits the event for CLI/file-association paths and drag-and-drop paths. The React app listens once and routes the file through the normal document loader.

### Path Normalization

Windows paths may arrive with backslashes. The frontend normalizes paths with:

```ts
const norm = (p: string) => p.replace(/\\/g, '/');
```

Keep state, comparisons, and file reads on normalized paths to avoid mismatches between the file tree and filesystem scope.

## Development Commands

```powershell
npm install
npm run build
npx tauri dev
npx tauri build
```

If a Windows build fails with `os error 5`, close any running AeroDoc executable and retry. The most common cause is an existing desktop process holding the old binary open.
