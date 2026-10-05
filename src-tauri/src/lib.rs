use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WindowEvent, Window};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

static DIRTY: AtomicBool = AtomicBool::new(false);
static CLOSING: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // never persist/restore decorations — the frameless look is intentional
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Focus the existing window and forward any file paths
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
                for a in argv.iter().skip(1) {
                    if a.ends_with(".md") || a.ends_with(".markdown") || a.ends_with(".txt") {
                        let _ = win.eval(&format!("window.__openPath({});", serde_json::to_string(a).unwrap_or_default()));
                    }
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                println!("[mdread] window decorated: {:?}", win.is_decorated());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_dirty,
            quit_app,
            close_window
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if CLOSING.load(Ordering::SeqCst) || !DIRTY.load(Ordering::SeqCst) {
                    return; // allow close
                }
                api.prevent_close();
                confirm_and_close(window);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running mdread");
}

/// Frontend reports unsaved-changes state so the window can guard closing.
#[tauri::command]
fn set_dirty(dirty: bool) {
    DIRTY.store(dirty, Ordering::SeqCst);
}

/// Frontend finished saving (or user chose Don't Save) — close for real.
#[tauri::command]
fn close_window(window: tauri::Window) {
    CLOSING.store(true, Ordering::SeqCst);
    let _ = window.close();
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    CLOSING.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn confirm_and_close(window: &Window) {
    let win = window.clone();
    window
        .dialog()
        .message("The document has unsaved changes. Save them?")
        .title("Unsaved changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Save".into(), "Don't Save".into()))
        .show(move |save| {
            if save {
                // Ask the frontend to save; it will invoke close_window when done
                let _ = win.emit("save-then-close", ());
            } else {
                CLOSING.store(true, Ordering::SeqCst);
                let _ = win.close();
            }
        });
}
