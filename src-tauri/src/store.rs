//! Persistence for `~/.config/gitswitcher/profiles.json`.
//!
//! The file is small (a handful of profiles), so every call re-reads it rather
//! than caching. That keeps the tray thread, the window, and any hand edit of
//! the JSON from drifting out of sync.

use crate::error::{JsonCtx, Result};
use crate::fsx;
use crate::model::Store;
use crate::paths;

pub fn load() -> Result<Store> {
    let path = paths::store_path()?;
    let Some(raw) = fsx::read_opt(&path)? else {
        return Ok(Store::default());
    };
    if raw.trim().is_empty() {
        return Ok(Store::default());
    }
    serde_json::from_str(&raw).ctx(format!("reading {}", path.display()))
}

pub fn save(store: &Store) -> Result<()> {
    let path = paths::store_path()?;
    let mut json = serde_json::to_string_pretty(store).ctx("serializing profiles")?;
    json.push('\n');
    // 0600: contains no secrets, but it does describe your accounts.
    fsx::write_atomic(&path, &json, 0o600)?;
    Ok(())
}
