use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_fs::FsExt;

#[tauri::command]
fn allow_vault_scope(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let scope = app.fs_scope();
    let p = std::path::PathBuf::from(&path);
    let _ = scope.allow_directory(&p, true);
    Ok(())
}

fn is_supported_document(path: &str) -> bool {
    let lower = path.to_lowercase();
    [
        ".md", ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".json", ".html", ".htm",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

fn emit_document_file(handle: tauri::AppHandle, path: String) {
    std::thread::spawn(move || {
        let file_path = std::path::PathBuf::from(&path);
        let scope = handle.fs_scope();
        let _ = scope.allow_file(&file_path);
        if let Some(parent) = file_path.parent() {
            let _ = scope.allow_directory(parent, true);
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = handle.emit("document-file-opened", path);
    });
}

/// Register AeroDoc as handler for the given extensions (with leading dots).
/// Writes HKCU only — no admin required.
#[tauri::command]
fn set_file_associations(extensions: Vec<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path = exe.to_string_lossy().to_string();
        let quoted = format!("\"{}\" \"%1\"", exe_path);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags("Software\\Classes", KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;

        let managed: &[&str] = &[
            ".md", ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".json", ".html", ".htm",
        ];

        // Clear previously managed associations first
        for ext in managed {
            let _ = classes.delete_subkey_all(format!("AeroDoc{}", ext));
            if let Ok(key) = classes.open_subkey_with_flags(*ext, KEY_SET_VALUE) {
                let _ = key.delete_value("");
            }
        }

        for raw in extensions {
            let mut ext = raw.trim().to_ascii_lowercase();
            if ext.is_empty() {
                continue;
            }
            if !ext.starts_with('.') {
                ext = format!(".{}", ext);
            }
            if !managed.contains(&ext.as_str()) {
                continue;
            }

            let prog_id = format!("AeroDoc{}", ext);
            let id_key = classes
                .create_subkey(&prog_id)
                .map_err(|e| e.to_string())?
                .0;
            let label = match ext.as_str() {
                ".md" => "Markdown Document",
                ".pdf" => "PDF Document",
                ".docx" => "Word Document",
                ".xlsx" => "Excel Workbook",
                ".csv" => "CSV File",
                ".txt" => "Text Document",
                ".json" => "JSON Document",
                ".html" | ".htm" => "HTML Document",
                _ => "AeroDoc Document",
            };
            id_key.set_value("", &label).map_err(|e| e.to_string())?;
            let cmd = id_key
                .create_subkey("shell\\open\\command")
                .map_err(|e| e.to_string())?
                .0;
            cmd.set_value("", &quoted).map_err(|e| e.to_string())?;

            let ext_key = classes.create_subkey(&ext).map_err(|e| e.to_string())?.0;
            ext_key.set_value("", &prog_id).map_err(|e| e.to_string())?;
        }

        // Notify Explorer so icons/open-with refresh
        #[allow(non_snake_case)]
        unsafe {
            use std::ffi::c_void;
            #[link(name = "shell32")]
            extern "system" {
                fn SHChangeNotify(wEventId: u32, uFlags: u32, dwItem1: *const c_void, dwItem2: *const c_void);
            }
            const SHCNE_ASSOCCHANGED: u32 = 0x08000000;
            const SHCNF_IDLIST: u32 = 0x0000;
            SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, std::ptr::null(), std::ptr::null());
        }

        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = extensions;
        Err("File associations are only supported on Windows".into())
    }
}

#[tauri::command]
fn get_app_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

fn emit_document_file_handle(handle: tauri::AppHandle, path: String) {
    emit_document_file(handle, path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            allow_vault_scope,
            set_file_associations,
            get_app_exe_path
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let args: Vec<String> = std::env::args().collect();
            if let Some(document_path) = args.iter().skip(1).find(|a| is_supported_document(a)) {
                emit_document_file_handle(app.handle().clone(), document_path.clone());
            }

            let handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                        for path in paths {
                            let path_string = path.to_string_lossy().to_string();
                            if is_supported_document(&path_string) {
                                emit_document_file_handle(handle.clone(), path_string);
                                break;
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
