//! Menu bar presence.
//!
//! The tray answers one question at a glance — "who am I committing as?" — and
//! the obvious follow-up: switching to another identity without opening the
//! window. It is kept current by a light poll plus an explicit refresh after
//! any change made in the window.

use crate::apply;
use crate::error::AppError;
use crate::model::Store;
use crate::status;
use crate::store;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
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
/// Menu id prefix for "make this profile the global identity".
const SWITCH_PREFIX: &str = "switch:";

/// The menu items we mutate in place instead of rebuilding the whole menu.
/// Behind a mutex because one part of the menu — a row per profile — is only
/// as stable as the profile list: when that changes the menu is rebuilt and
/// this is replaced wholesale.
pub struct TrayState(Mutex<TrayMenu>);

struct TrayMenu {
    /// The profile list these rows were built from. Any difference means the
    /// menu no longer describes reality and has to be rebuilt.
    signature: String,
    identity: MenuItem<Wry>,
    detail: MenuItem<Wry>,
    /// (profile id, its row), in menu order.
    rows: Vec<(String, CheckMenuItem<Wry>)>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let store = store::load().unwrap_or_default();
    let (menu, state) = build_menu(app, &store)?;
    app.manage(TrayState(Mutex::new(state)));

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Git Switcher")
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            let app = app.clone();
            // Menu events arrive on the main thread — the one that draws the
            // window. Everything below it shells out to git or writes files,
            // so none of it belongs there.
            std::thread::spawn(move || match id.as_str() {
                "open" => show_window(&app),
                "refresh" => refresh(&app),
                "quit" => app.exit(0),
                other => {
                    if let Some(profile_id) = other.strip_prefix(SWITCH_PREFIX) {
                        switch_to(&app, profile_id);
                    }
                }
            });
        });

    builder = builder
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(true);
    builder.build(app)?;

    start_polling(app.clone());
    refresh(app);
    Ok(())
}

/// Identifies the profile list as the menu renders it, so `sync_menu` can tell
/// a rename or a new account from a mere identity change.
fn signature(store: &Store) -> String {
    store
        .profiles
        .iter()
        .map(|profile| format!("{}\u{1f}{}\u{1f}{}", profile.id, profile.alias, profile.email))
        .collect::<Vec<_>>()
        .join("\u{1e}")
}

fn build_menu(app: &AppHandle, store: &Store) -> tauri::Result<(Menu<Wry>, TrayMenu)> {
    let identity = MenuItem::with_id(app, "identity", "Checking…", false, None::<&str>)?;
    let detail = MenuItem::with_id(app, "detail", "", false, None::<&str>)?;
    let heading = MenuItem::with_id(
        app,
        "switch-heading",
        "Switch global identity",
        false,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "Open Git Switcher", true, Some("Cmd+O"))?;
    let refresh_item = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("Cmd+Q"))?;

    let menu = Menu::new(app)?;
    menu.append_items(&[
        &identity,
        &detail,
        &PredefinedMenuItem::separator(app)?,
        &heading,
    ])?;

    let mut rows = Vec::new();
    if store.profiles.is_empty() {
        let empty = MenuItem::with_id(
            app,
            "no-profiles",
            "No profiles yet — open Git Switcher",
            false,
            None::<&str>,
        )?;
        menu.append(&empty)?;
    }
    for profile in &store.profiles {
        let row = CheckMenuItem::with_id(
            app,
            format!("{SWITCH_PREFIX}{}", profile.id),
            format!("{} — {}", profile.alias, profile.email),
            true,
            store.settings.global_profile_id.as_deref() == Some(profile.id.as_str()),
            None::<&str>,
        )?;
        menu.append(&row)?;
        rows.push((profile.id.clone(), row));
    }

    menu.append_items(&[
        &PredefinedMenuItem::separator(app)?,
        &open,
        &refresh_item,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])?;

    Ok((
        menu,
        TrayMenu {
            signature: signature(store),
            identity,
            detail,
            rows,
        },
    ))
}

/// Bring the menu's profile rows back in line with the store: rebuild them
/// when the profiles themselves changed, otherwise just move the check mark.
fn sync_menu(app: &AppHandle, store: &Store) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let Ok(mut current) = state.0.lock() else {
        return;
    };

    if current.signature != signature(store) {
        let Ok((menu, rebuilt)) = build_menu(app, store) else {
            return;
        };
        let Some(tray) = app.tray_by_id(TRAY_ID) else {
            return;
        };
        if tray.set_menu(Some(menu)).is_err() {
            // Keep the old menu and its handles rather than pointing at items
            // the tray never took.
            return;
        }
        *current = rebuilt;
    }

    for (id, row) in &current.rows {
        let _ = row.set_checked(store.settings.global_profile_id.as_deref() == Some(id.as_str()));
    }
}

/// Make a profile the global identity straight from the menu bar.
///
/// The window previews every write before making it; this deliberately does
/// not — a switch you have to confirm in a dialog is not a menu bar switch —
/// but the write itself is the same idempotent, backed-up one `apply_config`
/// performs.
fn switch_to(app: &AppHandle, profile_id: &str) {
    let mut store = match store::load() {
        Ok(store) => store,
        Err(error) => return fail(app, error),
    };
    // Deleted between the menu being built and the click landing.
    if let Err(error) = store.find(profile_id) {
        return fail(app, error);
    }

    store.settings.global_profile_id = Some(profile_id.to_string());
    if let Err(error) = store::save(&store) {
        return fail(app, error);
    }

    let global = store.profiles.iter().find(|p| p.id == profile_id);
    if let Err(error) = apply::apply(&store.profiles, global) {
        return fail(app, error);
    }

    // Profiles and settings moved, not just the status — the window needs more
    // than the snapshot `refresh` emits.
    let _ = app.emit("store-changed", ());
    refresh(app);
}

/// A failure with no window to report it in. Send it to the window anyway (it
/// may be open, or opened later in the same session) and re-sync the menu so
/// the check mark shows what is actually on disk, not what was clicked.
fn fail(app: &AppHandle, error: AppError) {
    let _ = app.emit("tray-error", error.to_string());
    refresh(app);
}

pub fn show_window(app: &AppHandle) {
    // Back to a regular app while a window is up: an accessory app gets no
    // menu bar of its own, which would cost the window Cmd+C/Cmd+V in every
    // text field it has.
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Put the app back in the background: no window, no Dock icon, just the tray.
pub fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

/// Re-read the identity and push it to both the menu bar and the window.
/// Errors are swallowed on purpose: a background poll must never pop a dialog.
pub fn refresh(app: &AppHandle) {
    let Ok(store) = store::load() else {
        set_title(app, "Git ?");
        return;
    };
    sync_menu(app, &store);

    let Ok(snapshot) = status::snapshot(&store) else {
        set_title(app, "Git ?");
        return;
    };

    let label = status::tray_label(&snapshot);
    set_title(app, &label);

    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(menu) = state.0.lock() {
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
            let _ = menu.identity.set_text(headline);
            let _ = menu.detail.set_text(detail);
        }
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
