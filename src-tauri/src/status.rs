//! "Which identity am I committing as, right now?"
//!
//! Answered by asking git itself rather than by re-implementing its config
//! resolution — `git -C <dir> config` already accounts for includeIf, local
//! repo overrides, and everything else in the precedence chain.

use crate::error::Result;
use crate::exec;
use crate::model::Store;
use crate::paths;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    /// "global" or "directory".
    pub scope: String,
    pub dir: Option<String>,
    pub dir_exists: bool,
    pub is_git_repo: bool,
    pub name: Option<String>,
    pub email: Option<String>,
    /// Alias of the profile this email belongs to, when one matches.
    pub matched_alias: Option<String>,
    /// "matched" | "unregistered" | "unset" | "missing"
    pub state: String,
    /// Config file the effective `user.email` actually came from — the answer
    /// to "why is it this one?".
    pub origin: Option<String>,
    pub remote_url: Option<String>,
    /// Profile whose configured folders cover this path. For a folder that
    /// isn't a repo yet, git reports the global identity, so this is the only
    /// way to say what a repo created here *would* commit as.
    pub folder_rule_alias: Option<String>,
}

fn classify(email: &Option<String>, store: &Store) -> (String, Option<String>) {
    match email {
        None => ("unset".to_string(), None),
        Some(email) => match store.by_email(email) {
            Some(profile) => ("matched".to_string(), Some(profile.alias.clone())),
            // Deliberately loud: a commit is about to be made as somebody the
            // app has never heard of.
            None => ("unregistered".to_string(), None),
        },
    }
}

/// `git config --show-origin` prints `file:/path/to/config\tvalue`; we want a
/// readable path and nothing else.
fn parse_origin(raw: &str) -> Option<String> {
    let (origin, _) = raw.split_once('\t')?;
    let path = origin.strip_prefix("file:").unwrap_or(origin);
    Some(paths::contract(Path::new(path.trim())))
}

/// Which profile's `includeIf` folder covers `dir`. Longest match wins, which
/// is the same rule git applies when several includes match.
fn folder_rule(dir: &Path, store: &Store) -> Option<String> {
    let mut best: Option<(usize, String)> = None;
    for profile in &store.profiles {
        for raw in &profile.dirs {
            let Ok(candidate) = paths::expand(raw) else {
                continue;
            };
            if dir.starts_with(&candidate) {
                let depth = candidate.components().count();
                if best.as_ref().is_none_or(|(best_depth, _)| depth > *best_depth) {
                    best = Some((depth, profile.alias.clone()));
                }
            }
        }
    }
    best.map(|(_, alias)| alias)
}

pub fn global_identity(store: &Store) -> Result<Identity> {
    let name = exec::run("git", &["config", "--global", "--get", "user.name"], None)?
        .trimmed_stdout();
    let email = exec::run("git", &["config", "--global", "--get", "user.email"], None)?
        .trimmed_stdout();
    let (state, matched_alias) = classify(&email, store);

    Ok(Identity {
        scope: "global".to_string(),
        dir: None,
        dir_exists: true,
        is_git_repo: false,
        name,
        email,
        matched_alias,
        state,
        origin: Some(paths::contract(&paths::gitconfig_path()?)),
        remote_url: None,
        folder_rule_alias: None,
    })
}

/// Effective identity for a folder — what a commit made there would be
/// attributed to.
pub fn directory_identity(raw_dir: &str, store: &Store) -> Result<Identity> {
    let dir = paths::expand(raw_dir)?;
    let display = paths::contract(&dir);

    if !dir.is_dir() {
        return Ok(Identity {
            scope: "directory".to_string(),
            dir: Some(display),
            dir_exists: false,
            is_git_repo: false,
            name: None,
            email: None,
            matched_alias: None,
            state: "missing".to_string(),
            origin: None,
            remote_url: None,
            folder_rule_alias: None,
        });
    }

    let is_git_repo = exec::run(
        "git",
        &["rev-parse", "--is-inside-work-tree"],
        Some(&dir),
    )?
    .trimmed_stdout()
    .as_deref()
        == Some("true");

    let name = exec::run("git", &["config", "--get", "user.name"], Some(&dir))?.trimmed_stdout();
    let email = exec::run("git", &["config", "--get", "user.email"], Some(&dir))?.trimmed_stdout();
    let origin = exec::run(
        "git",
        &["config", "--show-origin", "--get", "user.email"],
        Some(&dir),
    )?
    .trimmed_stdout()
    .as_deref()
    .and_then(parse_origin);

    let remote_url = if is_git_repo {
        exec::run("git", &["remote", "get-url", "origin"], Some(&dir))?.trimmed_stdout()
    } else {
        None
    };

    let (state, matched_alias) = classify(&email, store);

    Ok(Identity {
        scope: "directory".to_string(),
        dir: Some(display),
        dir_exists: true,
        is_git_repo,
        name,
        email,
        matched_alias,
        state,
        origin,
        remote_url,
        folder_rule_alias: folder_rule(&dir, store),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub global: Identity,
    pub directory: Option<Identity>,
    pub checked_at: String,
}

pub fn snapshot(store: &Store) -> Result<Snapshot> {
    let directory = match &store.settings.watched_dir {
        Some(dir) => Some(directory_identity(dir, store)?),
        None => None,
    };
    Ok(Snapshot {
        global: global_identity(store)?,
        directory,
        checked_at: crate::model::now_iso(),
    })
}

/// One short line for the menu bar. Prefers the watched folder, because that's
/// the identity about to be used for a commit; falls back to global.
pub fn tray_label(snapshot: &Snapshot) -> String {
    let identity = snapshot.directory.as_ref().unwrap_or(&snapshot.global);
    match identity.state.as_str() {
        "matched" => identity.matched_alias.clone().unwrap_or_default(),
        "unregistered" => "Unregistered".to_string(),
        "unset" => "No identity".to_string(),
        _ => "Folder missing".to_string(),
    }
}
