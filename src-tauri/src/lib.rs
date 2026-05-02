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
    [".md", ".pdf", ".docx", ".xlsx", ".csv"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

fn emit_document_file(handle: tauri::AppHandle, path: String) {
    std::thread::spawn(move || {
        // Add file and parent dir to fs scope so frontend fs APIs won't be blocked.
        let file_path = std::path::PathBuf::from(&path);
        let scope = handle.fs_scope();
        let _ = scope.allow_file(&file_path);
        if let Some(parent) = file_path.parent() {
            let _ = scope.allow_directory(parent, true);
        }

        // Wait for webview to initialize
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = handle.emit("document-file-opened", path);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![allow_vault_scope])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle CLI args: file association / double-click
            let args: Vec<String> = std::env::args().collect();
            if let Some(document_path) = args.iter().skip(1).find(|a| is_supported_document(a)) {
                emit_document_file(app.handle().clone(), document_path.clone());
            }

            // Handle drag-drop via window event
            let handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                        for path in paths {
                            let path_string = path.to_string_lossy().to_string();
                            if is_supported_document(&path_string) {
                                emit_document_file(handle.clone(), path_string);
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
