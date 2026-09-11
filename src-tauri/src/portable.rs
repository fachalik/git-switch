//! Export / import — the "set up a new laptop quickly" path.
//!
//! The export file contains profile metadata only. It records the *path* of
//! each SSH key, never the key itself: on the new machine you re-generate the
//! keypair from the app and register the new public key with the host.

use crate::error::{AppError, JsonCtx, Result};
use crate::fsx;
use crate::model::{now_iso, Profile, ProfileInput, Store, SCHEMA_VERSION};
use crate::paths;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub kind: String,
    pub version: u32,
    pub exported_at: String,
    pub profiles: Vec<Profile>,
}

const BUNDLE_KIND: &str = "gitswitcher.profiles";

pub fn export(store: &Store, raw_path: &str) -> Result<String> {
    let path = paths::expand(raw_path)?;
    let bundle = Bundle {
        kind: BUNDLE_KIND.to_string(),
        version: SCHEMA_VERSION,
        exported_at: now_iso(),
        profiles: store.profiles.clone(),
    };
    let mut json = serde_json::to_string_pretty(&bundle).ctx("serializing export")?;
    json.push('\n');
    fsx::write_atomic(&path, &json, 0o600)?;
    Ok(paths::contract(&path))
}

fn read_bundle(path: &Path) -> Result<Bundle> {
    let raw = fsx::read_opt(path)?
        .ok_or_else(|| AppError::not_found(format!("no file at {}", path.display())))?;
    let bundle: Bundle =
        serde_json::from_str(&raw).ctx(format!("reading {}", path.display()))?;
    if bundle.kind != BUNDLE_KIND {
        return Err(AppError::validation(
            "that file is not a Git Switcher export",
        ));
    }
    if bundle.version > SCHEMA_VERSION {
        return Err(AppError::validation(format!(
            "that export was written by a newer version of the app (format v{})",
            bundle.version
        )));
    }
    Ok(bundle)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub alias: String,
    pub name: String,
    pub email: String,
    pub host_alias: String,
    /// "new" | "conflict" | "identical" | "invalid"
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub path: String,
    pub exported_at: String,
    pub entries: Vec<ImportEntry>,
    pub new_count: usize,
    pub conflict_count: usize,
}

fn same(a: &Profile, b: &Profile) -> bool {
    a.name == b.name
        && a.email == b.email
        && a.host_name == b.host_name
        && a.host_alias == b.host_alias
        && a.ssh_key_path == b.ssh_key_path
        && a.dirs == b.dirs
}

/// Validate every incoming profile and describe what importing would do,
/// so the confirmation step can show it rather than just asking "are you sure".
pub fn preview(store: &Store, raw_path: &str) -> Result<ImportPreview> {
    let path = paths::expand(raw_path)?;
    let bundle = read_bundle(&path)?;

    let mut entries = Vec::new();
    let mut new_count = 0;
    let mut conflict_count = 0;

    for incoming in &bundle.profiles {
        let mut entry = ImportEntry {
            alias: incoming.alias.clone(),
            name: incoming.name.clone(),
            email: incoming.email.clone(),
            host_alias: incoming.host_alias.clone(),
            status: "new".to_string(),
            detail: None,
        };

        // Imported data is untrusted input like anything else the user types.
        if let Err(err) = to_input(incoming).clean() {
            entry.status = "invalid".to_string();
            entry.detail = Some(err.to_string());
            entries.push(entry);
            continue;
        }

        match store.by_alias(&incoming.alias) {
            Some(existing) if same(existing, incoming) => {
                entry.status = "identical".to_string();
                entry.detail = Some("already present, unchanged".to_string());
            }
            Some(_) => {
                entry.status = "conflict".to_string();
                entry.detail = Some("a profile with this alias already exists".to_string());
                conflict_count += 1;
            }
            None => {
                new_count += 1;
            }
        }
        entries.push(entry);
    }

    Ok(ImportPreview {
        path: paths::contract(&path),
        exported_at: bundle.exported_at,
        entries,
        new_count,
        conflict_count,
    })
}

fn to_input(profile: &Profile) -> ProfileInput {
    ProfileInput {
        alias: profile.alias.clone(),
        name: profile.name.clone(),
        email: profile.email.clone(),
        host_name: profile.host_name.clone(),
        host_alias: profile.host_alias.clone(),
        ssh_key_path: profile.ssh_key_path.clone(),
        dirs: profile.dirs.clone(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: Vec<String>,
    pub replaced: Vec<String>,
    pub skipped: Vec<String>,
}

/// `overwrite` decides what happens to aliases that already exist: replace
/// them, or leave them alone. Nothing else is touched either way.
pub fn import(store: &mut Store, raw_path: &str, overwrite: bool) -> Result<ImportReport> {
    let path = paths::expand(raw_path)?;
    let bundle = read_bundle(&path)?;

    let mut report = ImportReport {
        added: Vec::new(),
        replaced: Vec::new(),
        skipped: Vec::new(),
    };

    for incoming in bundle.profiles {
        let clean = match to_input(&incoming).clean() {
            Ok(clean) => clean,
            Err(_) => {
                report.skipped.push(incoming.alias.clone());
                continue;
            }
        };

        let existing = store
            .profiles
            .iter()
            .position(|p| p.alias.eq_ignore_ascii_case(&clean.alias));

        match existing {
            Some(index) if overwrite => {
                let current = &store.profiles[index];
                let merged = Profile {
                    // Keep the local id so anything referencing it still works.
                    id: current.id.clone(),
                    alias: clean.alias.clone(),
                    name: clean.name,
                    email: clean.email,
                    host_name: clean.host_name,
                    host_alias: clean.host_alias,
                    ssh_key_path: clean.ssh_key_path,
                    dirs: clean.dirs,
                    created_at: current.created_at.clone(),
                    updated_at: now_iso(),
                };
                store.profiles[index] = merged;
                report.replaced.push(clean.alias);
            }
            Some(_) => report.skipped.push(clean.alias),
            None => {
                store.profiles.push(Profile {
                    id: uuid::Uuid::new_v4().to_string(),
                    alias: clean.alias.clone(),
                    name: clean.name,
                    email: clean.email,
                    host_name: clean.host_name,
                    host_alias: clean.host_alias,
                    ssh_key_path: clean.ssh_key_path,
                    dirs: clean.dirs,
                    created_at: now_iso(),
                    updated_at: now_iso(),
                });
                report.added.push(clean.alias);
            }
        }
    }

    Ok(report)
}
