//! Every filesystem path the app touches is produced here, so the set of
//! files we are allowed to read or write stays auditable in one place.

use crate::error::{AppError, Result};
use std::path::{Component, Path, PathBuf};

pub fn home() -> Result<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::validation("could not determine home directory"))
}

/// `~/.config/gitswitcher/profiles.json` — the single source of truth for app data.
pub fn store_path() -> Result<PathBuf> {
    Ok(home()?.join(".config/gitswitcher/profiles.json"))
}

pub fn ssh_config_path() -> Result<PathBuf> {
    Ok(home()?.join(".ssh/config"))
}

pub fn ssh_dir() -> Result<PathBuf> {
    Ok(home()?.join(".ssh"))
}

pub fn gitconfig_path() -> Result<PathBuf> {
    Ok(home()?.join(".gitconfig"))
}

/// The per-profile include file pulled in by `includeIf` from `~/.gitconfig`.
pub fn include_path(alias: &str) -> Result<PathBuf> {
    Ok(home()?.join(format!(".gitconfig-{alias}")))
}

/// Expand a leading `~` and reject anything that could escape into a
/// surprising location or inject a newline into a config file we generate.
pub fn expand(raw: &str) -> Result<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("path is empty"));
    }
    if trimmed.contains(['\n', '\r', '\0']) {
        return Err(AppError::validation("path contains an illegal character"));
    }

    let expanded = if trimmed == "~" {
        home()?
    } else if let Some(rest) = trimmed.strip_prefix("~/") {
        home()?.join(rest)
    } else {
        PathBuf::from(trimmed)
    };

    if !expanded.is_absolute() {
        return Err(AppError::validation(format!(
            "path must be absolute (or start with ~/): {trimmed}"
        )));
    }
    if expanded
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(AppError::validation(format!(
            "path must not contain '..': {trimmed}"
        )));
    }
    Ok(expanded)
}

/// Like [`expand`], but additionally requires the path to live under `$HOME`.
/// Used for SSH keys, which have no business being written elsewhere.
pub fn expand_within_home(raw: &str) -> Result<PathBuf> {
    let path = expand(raw)?;
    let home = home()?;
    if !path.starts_with(&home) {
        return Err(AppError::validation(format!(
            "path must be inside your home directory: {}",
            path.display()
        )));
    }
    Ok(path)
}

/// Render a path back with `~` so generated config files stay portable
/// between machines with different usernames.
pub fn contract(path: &Path) -> String {
    match home() {
        Ok(home) => match path.strip_prefix(&home) {
            Ok(rest) => format!("~/{}", rest.display()),
            Err(_) => path.display().to_string(),
        },
        Err(_) => path.display().to_string(),
    }
}

/// The public half of an SSH keypair, by ssh-keygen's convention.
pub fn public_key_path(private: &Path) -> PathBuf {
    let mut s = private.as_os_str().to_os_string();
    s.push(".pub");
    PathBuf::from(s)
}
