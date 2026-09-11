//! The IPC surface. Every command is thin: validate, delegate, persist,
//! refresh the tray. All the real logic lives in the modules below it.

use crate::apply;
use crate::error::{AppError, Result};
use crate::keygen::{self, GeneratedKey, KeyHealth, SshTest};
use crate::model::{now_iso, Profile, ProfileInput, Settings, Store};
use crate::paths;
use crate::portable::{self, ImportPreview, ImportReport};
use crate::status::{self, Snapshot};
use crate::store;
use crate::tray;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub profiles: Vec<Profile>,
    pub settings: Settings,
    pub health: Vec<KeyHealth>,
    pub status: Snapshot,
    pub plan: apply::Plan,
    pub locations: Locations,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Locations {
    pub store: String,
    pub ssh_config: String,
    pub gitconfig: String,
}

fn locations() -> Result<Locations> {
    Ok(Locations {
        store: paths::contract(&paths::store_path()?),
        ssh_config: paths::contract(&paths::ssh_config_path()?),
        gitconfig: paths::contract(&paths::gitconfig_path()?),
    })
}

/// The profile designated as the global identity, if it still exists.
fn global_profile(store: &Store) -> Option<&Profile> {
    let id = store.settings.global_profile_id.as_deref()?;
    store.profiles.iter().find(|p| p.id == id)
}

/// One round trip for everything the window renders. Cheaper than five
/// separate calls and guarantees the pieces are consistent with each other.
fn overview(store: &Store) -> Result<Overview> {
    let health = store
        .profiles
        .iter()
        .map(keygen::health)
        .collect::<Result<Vec<_>>>()?;

    Ok(Overview {
        profiles: store.profiles.clone(),
        settings: store.settings.clone(),
        health,
        status: status::snapshot(store)?,
        plan: apply::preview(&store.profiles, global_profile(store))?,
        locations: locations()?,
    })
}

#[tauri::command]
pub fn get_overview() -> Result<Overview> {
    overview(&store::load()?)
}

/// Reject an alias or host alias that another profile already owns — two
/// profiles sharing either one would produce a config file that contradicts
/// itself.
fn ensure_unique(store: &Store, alias: &str, host_alias: &str, skip_id: Option<&str>) -> Result<()> {
    for profile in &store.profiles {
        if Some(profile.id.as_str()) == skip_id {
            continue;
        }
        if profile.alias.eq_ignore_ascii_case(alias) {
            return Err(AppError::conflict(format!(
                "another profile already uses the alias \"{alias}\""
            )));
        }
        if profile.host_alias.eq_ignore_ascii_case(host_alias) {
            return Err(AppError::conflict(format!(
                "profile \"{}\" already uses the SSH host alias \"{host_alias}\"",
                profile.alias
            )));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_profile(app: AppHandle, input: ProfileInput) -> Result<Overview> {
    let mut store = store::load()?;
    let clean = input.clean()?;
    ensure_unique(&store, &clean.alias, &clean.host_alias, None)?;

    store.profiles.push(Profile {
        id: uuid::Uuid::new_v4().to_string(),
        alias: clean.alias,
        name: clean.name,
        email: clean.email,
        host_name: clean.host_name,
        host_alias: clean.host_alias,
        ssh_key_path: clean.ssh_key_path,
        dirs: clean.dirs,
        created_at: now_iso(),
        updated_at: now_iso(),
    });

    store::save(&store)?;
    tray::refresh(&app);
    overview(&store)
}

#[tauri::command]
pub fn update_profile(app: AppHandle, id: String, input: ProfileInput) -> Result<Overview> {
    let mut store = store::load()?;
    let clean = input.clean()?;
    ensure_unique(&store, &clean.alias, &clean.host_alias, Some(&id))?;

    let index = store
        .profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| AppError::not_found(format!("no profile with id {id}")))?;

    let created_at = store.profiles[index].created_at.clone();
    store.profiles[index] = Profile {
        id: id.clone(),
        alias: clean.alias,
        name: clean.name,
        email: clean.email,
        host_name: clean.host_name,
        host_alias: clean.host_alias,
        ssh_key_path: clean.ssh_key_path,
        dirs: clean.dirs,
        created_at,
        updated_at: now_iso(),
    };

    store::save(&store)?;
    tray::refresh(&app);
    overview(&store)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> Result<Overview> {
    let mut store = store::load()?;
    let before = store.profiles.len();
    store.profiles.retain(|p| p.id != id);
    if store.profiles.len() == before {
        return Err(AppError::not_found(format!("no profile with id {id}")));
    }

    if store.settings.global_profile_id.as_deref() == Some(id.as_str()) {
        store.settings.global_profile_id = None;
    }

    // The generated files stay until the next apply, which is where the user
    // gets to see the removal before it happens.
    store::save(&store)?;
    tray::refresh(&app);
    overview(&store)
}

#[tauri::command]
pub fn preview_apply() -> Result<apply::Plan> {
    let store = store::load()?;
    apply::preview(&store.profiles, global_profile(&store))
}

#[tauri::command]
pub fn apply_config(app: AppHandle) -> Result<apply::ApplyReport> {
    let store = store::load()?;
    let report = apply::apply(&store.profiles, global_profile(&store))?;
    tray::refresh(&app);
    Ok(report)
}

/// Choose which profile supplies the global `[user]` identity — the fallback
/// for every repo no folder rule covers. `None` stops managing it and leaves
/// whatever is already in `~/.gitconfig`.
///
/// Like every other change, this only records the intent; nothing reaches disk
/// until the user reviews and applies.
#[tauri::command]
pub fn set_global_profile(app: AppHandle, id: Option<String>) -> Result<Overview> {
    let mut store = store::load()?;

    if let Some(id) = &id {
        // Fail loudly rather than silently storing a dangling id.
        store.find(id)?;
    }
    store.settings.global_profile_id = id;

    store::save(&store)?;
    tray::refresh(&app);
    overview(&store)
}

#[tauri::command]
pub fn generate_key(id: String, overwrite: bool) -> Result<GeneratedKey> {
    let store = store::load()?;
    keygen::generate(store.find(&id)?, overwrite)
}

#[tauri::command]
pub fn test_ssh(id: String) -> Result<SshTest> {
    let store = store::load()?;
    keygen::test_connection(&store.find(&id)?.host_alias)
}

#[tauri::command]
pub fn set_watched_dir(app: AppHandle, dir: Option<String>) -> Result<Overview> {
    let mut store = store::load()?;

    match dir {
        Some(raw) => {
            let expanded = paths::expand(&raw)?;
            if !expanded.is_dir() {
                return Err(AppError::not_found(format!(
                    "{} is not a folder",
                    paths::contract(&expanded)
                )));
            }
            let display = paths::contract(&expanded);
            store.settings.recent_dirs.retain(|d| d != &display);
            store.settings.recent_dirs.insert(0, display.clone());
            store.settings.recent_dirs.truncate(8);
            store.settings.watched_dir = Some(display);
        }
        None => store.settings.watched_dir = None,
    }

    store::save(&store)?;
    tray::refresh(&app);
    overview(&store)
}

#[tauri::command]
pub fn get_status() -> Result<Snapshot> {
    status::snapshot(&store::load()?)
}

#[tauri::command]
pub fn export_profiles(path: String) -> Result<String> {
    portable::export(&store::load()?, &path)
}

#[tauri::command]
pub fn preview_import(path: String) -> Result<ImportPreview> {
    portable::preview(&store::load()?, &path)
}

#[tauri::command]
pub fn import_profiles(app: AppHandle, path: String, overwrite: bool) -> Result<ImportReport> {
    let mut store = store::load()?;
    let report = portable::import(&mut store, &path, overwrite)?;
    store::save(&store)?;
    tray::refresh(&app);
    Ok(report)
}
