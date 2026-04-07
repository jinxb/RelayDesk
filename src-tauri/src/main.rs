#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod shell;
mod sidecar;
mod transport;
mod tray;

use models::MAIN_WINDOW_LABEL;
use shell::show_main_window;
use sidecar::{launch_sidecar_internal, shutdown_sidecar, SidecarStore};
use tauri::{Manager, State, WindowEvent};

fn main() {
    tauri::Builder::default()
        .manage(SidecarStore::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::build_tray(&handle)?;

            let state: State<'_, SidecarStore> = app.state();
            if let Err(error) = launch_sidecar_internal(&handle, &state) {
                eprintln!("[relaydesk-shell] sidecar auto-launch failed: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            shell::shell_identity,
            shell::window_show,
            shell::window_hide,
            shell::open_path,
            shell::reveal_path,
            shell::pick_directory,
            transport::sidecar_request,
            sidecar::sidecar_status,
            sidecar::sidecar_launch,
            sidecar::sidecar_halt,
        ])
        .build(tauri::generate_context!())
        .expect("desktop shell boot failed")
        .run(|app, event| {
            match event {
                tauri::RunEvent::Exit => {
                    shutdown_sidecar(app);
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    if !has_visible_windows {
                        let _ = show_main_window(app);
                    }
                }
                _ => {}
            }
        });
}
