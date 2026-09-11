//! Menu bar presence.
//!
//! The tray answers one question at a glance — "who am I committing as?" —
//! and is kept current by a light poll plus an explicit refresh after any
//! change made in the window.

use crate::status;
use crate::store;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};

pub const TRAY_ID: &str = "gitswitcher-tray";
/// Monochrome template image — macOS tints it to match the menu bar, so it
/// stays legible in both light and dark appearances.
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");
/// Cheap enough (two `git config` reads) to run continuously, slow enough to
/// be invisible.
const POLL_INTERVAL: Duration = Duration::from_secs(10);

/// Menu items we mutate in place instead of rebuilding the whole menu.
pub struct TrayItems {
    pub identity: MenuItem<Wry>,
    pub detail: MenuItem<Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let identity = MenuItem::with_id(app, "identity", "Checking…", false, None::<&str>)?;
    let detail = MenuItem::with_id(app, "detail", "", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Git Switcher", true, Some("Cmd+O"))?;
    let refresh_item = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("Cmd+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &identity,
            &detail,
            &PredefinedMenuItem::separator(app)?,
            &open,
            &refresh_item,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    app.manage(TrayItems {
        identity: identity.clone(),
        detail: detail.clone(),
    });

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Git Switcher")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app),
            "refresh" => refresh(app),
            "quit" => app.exit(0),
            _ => {}
        });

    builder = builder
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(true);
    builder.build(app)?;

    start_polling(app.clone());
    refresh(app);
    Ok(())
}

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Re-read the identity and push it to both the menu bar and the window.
/// Errors are swallowed on purpose: a background poll must never pop a dialog.
pub fn refresh(app: &AppHandle) {
    let Ok(store) = store::load() else {
        set_title(app, "Git ?");
        return;
    };
    let Ok(snapshot) = status::snapshot(&store) else {
        set_title(app, "Git ?");
        return;
    };

    let label = status::tray_label(&snapshot);
    set_title(app, &label);

    if let Some(items) = app.try_state::<TrayItems>() {
        let identity = snapshot.directory.as_ref().unwrap_or(&snapshot.global);
        let headline = match identity.state.as_str() {
            "matched" => format!("Committing as: {label}"),
            "unregistered" => "Unregistered identity".to_string(),
            "unset" => "No git identity set".to_string(),
            _ => "Watched folder is missing".to_string(),
        };
        let detail = match (&identity.email, &identity.dir) {
            (Some(email), Some(dir)) => format!("{email} — {dir}"),
            (Some(email), None) => format!("{email} — global"),
            (None, Some(dir)) => dir.clone(),
            (None, None) => "global".to_string(),
        };
        let _ = items.identity.set_text(headline);
        let _ = items.detail.set_text(detail);
    }

    let _ = app.emit("status-changed", &snapshot);
}

fn set_title(app: &AppHandle, label: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(Some(label));
        let _ = tray.set_tooltip(Some(format!("Git Switcher — {label}")));
    }
}

fn start_polling(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        refresh(&app);
    });
}
