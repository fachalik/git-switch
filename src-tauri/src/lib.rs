pub mod apply;
pub mod commands;
pub mod error;
pub mod exec;
pub mod fsx;
pub mod gitcfg;
pub mod keygen;
pub mod model;
pub mod paths;
pub mod portable;
pub mod sshcfg;
pub mod status;
pub mod store;
pub mod tray;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // A menu bar app lives in the menu bar: no Dock icon, no app
            // switcher entry, nothing to quit by accident. The policy goes back
            // to Regular while the window is up (see `tray::show_window`), so
            // that window still gets the menu bar its text fields need.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build(app.handle())?;

            // The window starts hidden, which on a first run is indistinguishable
            // from a launch that failed — there is nothing in the menu bar to
            // recognise yet either. Show it until there is a profile to show.
            if store::load().map(|s| s.profiles.is_empty()).unwrap_or(true) {
                tray::show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Menu bar apps outlive their window: closing it hides the window
            // and leaves the tray running, which is the macOS convention.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    tray::hide_window(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::create_profile,
            commands::update_profile,
            commands::delete_profile,
            commands::preview_apply,
            commands::apply_config,
            commands::generate_key,
            commands::test_ssh,
            commands::set_watched_dir,
            commands::set_global_profile,
            commands::get_status,
            commands::export_profiles,
            commands::preview_import,
            commands::import_profiles,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
