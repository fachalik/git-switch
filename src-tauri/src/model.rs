//! Data model + input validation.
//!
//! Validation is strict on purpose: every one of these fields ends up either
//! in a generated config file or on an `ssh-keygen` command line, so a stray
//! newline or quote is a config-injection bug, not a cosmetic one.

use crate::error::{AppError, Result};
use crate::paths;
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    /// Short unique handle, e.g. `work`. Also names `~/.gitconfig-work`.
    pub alias: String,
    pub name: String,
    pub email: String,
    /// Real host the alias points at, e.g. `github.com`, `gitlab.com`.
    #[serde(default = "default_host_name")]
    pub host_name: String,
    /// SSH `Host` entry, e.g. `github.com-work`.
    pub host_alias: String,
    pub ssh_key_path: String,
    /// Folders this identity should apply to, via git `includeIf gitdir:`.
    #[serde(default)]
    pub dirs: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn default_host_name() -> String {
    "github.com".to_string()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub alias: String,
    pub name: String,
    pub email: String,
    #[serde(default = "default_host_name")]
    pub host_name: String,
    pub host_alias: String,
    pub ssh_key_path: String,
    #[serde(default)]
    pub dirs: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Folder whose effective git identity the tray reports.
    #[serde(default)]
    pub watched_dir: Option<String>,
    #[serde(default)]
    pub recent_dirs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default = "schema_version")]
    pub version: u32,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub settings: Settings,
}

fn schema_version() -> u32 {
    SCHEMA_VERSION
}

impl Default for Store {
    fn default() -> Self {
        Store {
            version: SCHEMA_VERSION,
            profiles: Vec::new(),
            settings: Settings::default(),
        }
    }
}

impl Store {
    pub fn find(&self, id: &str) -> Result<&Profile> {
        self.profiles
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| AppError::not_found(format!("no profile with id {id}")))
    }

    pub fn by_alias(&self, alias: &str) -> Option<&Profile> {
        self.profiles
            .iter()
            .find(|p| p.alias.eq_ignore_ascii_case(alias))
    }

    /// Profile whose email matches, case-insensitively — the lookup behind the
    /// tray's "which identity is this?" answer.
    pub fn by_email(&self, email: &str) -> Option<&Profile> {
        self.profiles
            .iter()
            .find(|p| p.email.eq_ignore_ascii_case(email))
    }
}

// ---------------------------------------------------------------- validation

fn reject_control_chars(field: &str, value: &str) -> Result<()> {
    if value.chars().any(|c| c.is_control()) {
        return Err(AppError::validation(format!(
            "{field} must not contain line breaks or control characters"
        )));
    }
    Ok(())
}

/// `alias` doubles as a filename component (`~/.gitconfig-<alias>`), so it is
/// restricted to a conservative charset with no separators or leading dot.
pub fn validate_alias(alias: &str) -> Result<String> {
    let alias = alias.trim();
    if alias.is_empty() {
        return Err(AppError::validation("alias is required"));
    }
    if alias.len() > 40 {
        return Err(AppError::validation("alias must be 40 characters or fewer"));
    }
    let first_ok = alias
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric());
    let rest_ok = alias
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !first_ok || !rest_ok {
        return Err(AppError::validation(
            "alias may only contain letters, digits, '-' and '_', and must start with a letter or digit",
        ));
    }
    Ok(alias.to_string())
}

/// Hostnames and SSH host aliases share a charset; both are written verbatim
/// into `~/.ssh/config`, so whitespace and quotes are not allowed.
pub fn validate_host(field: &str, value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation(format!("{field} is required")));
    }
    if value.len() > 253 {
        return Err(AppError::validation(format!("{field} is too long")));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(AppError::validation(format!(
            "{field} may only contain letters, digits, '.', '-' and '_'"
        )));
    }
    Ok(value.to_string())
}

pub fn validate_email(email: &str) -> Result<String> {
    let email = email.trim();
    reject_control_chars("email", email)?;
    if email.is_empty() {
        return Err(AppError::validation("email is required"));
    }
    if email.chars().any(char::is_whitespace) {
        return Err(AppError::validation("email must not contain spaces"));
    }
    let mut parts = email.split('@');
    let local = parts.next().unwrap_or_default();
    let domain = parts.next().unwrap_or_default();
    if parts.next().is_some() || local.is_empty() || domain.is_empty() {
        return Err(AppError::validation("email must look like name@example.com"));
    }
    if !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') {
        return Err(AppError::validation("email domain looks invalid"));
    }
    Ok(email.to_string())
}

pub fn validate_name(name: &str) -> Result<String> {
    let name = name.trim();
    reject_control_chars("name", name)?;
    if name.is_empty() {
        return Err(AppError::validation("name is required"));
    }
    if name.len() > 120 {
        return Err(AppError::validation("name must be 120 characters or fewer"));
    }
    Ok(name.to_string())
}

/// Normalized, validated form of a [`ProfileInput`].
pub struct CleanInput {
    pub alias: String,
    pub name: String,
    pub email: String,
    pub host_name: String,
    pub host_alias: String,
    pub ssh_key_path: String,
    pub dirs: Vec<String>,
}

impl ProfileInput {
    pub fn clean(&self) -> Result<CleanInput> {
        let alias = validate_alias(&self.alias)?;
        let name = validate_name(&self.name)?;
        let email = validate_email(&self.email)?;
        let host_name = validate_host("host", &self.host_name)?;
        let host_alias = validate_host("SSH host alias", &self.host_alias)?;

        // Keys must sit under $HOME; ssh(1) will not read them from anywhere
        // exotic anyway, and it keeps the writable surface small.
        let key = paths::expand_within_home(&self.ssh_key_path)?;
        if key.extension().is_some_and(|e| e == "pub") {
            return Err(AppError::validation(
                "point this at the private key, not the .pub file",
            ));
        }

        let mut dirs = Vec::new();
        for dir in &self.dirs {
            if dir.trim().is_empty() {
                continue;
            }
            let expanded = paths::expand(dir)?;
            let contracted = paths::contract(&expanded);
            if !dirs.contains(&contracted) {
                dirs.push(contracted);
            }
        }

        Ok(CleanInput {
            alias,
            name,
            email,
            host_name,
            host_alias,
            ssh_key_path: paths::contract(&key),
            dirs,
        })
    }
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alias_charset_is_enforced() {
        assert!(validate_alias("work").is_ok());
        assert!(validate_alias("client-x_2").is_ok());
        assert!(validate_alias("").is_err());
        assert!(validate_alias("-leading").is_err());
        assert!(validate_alias("has space").is_err());
        // Would let an alias escape into another directory via the
        // ~/.gitconfig-<alias> filename.
        assert!(validate_alias("../../etc/passwd").is_err());
        assert!(validate_alias("a/b").is_err());
    }

    #[test]
    fn names_may_not_smuggle_config_directives() {
        // A newline here would inject a section into ~/.gitconfig-<alias>.
        assert!(validate_name("Real Name\n[core]\n\tsshCommand = evil").is_err());
        assert!(validate_name("Real Name").is_ok());
    }

    #[test]
    fn email_rules() {
        assert!(validate_email("me@example.com").is_ok());
        assert!(validate_email("me@example").is_err());
        assert!(validate_email("me@@example.com").is_err());
        assert!(validate_email("no-at-sign").is_err());
        assert!(validate_email("me @example.com").is_err());
        assert!(validate_email("me@example.com\nx").is_err());
    }

    #[test]
    fn host_values_reject_whitespace_and_quotes() {
        assert!(validate_host("host", "github.com").is_ok());
        assert!(validate_host("host", "github.com-work").is_ok());
        assert!(validate_host("host", "git hub.com").is_err());
        assert!(validate_host("host", "github.com\n  User root").is_err());
    }

    #[test]
    fn lookup_by_email_ignores_case() {
        let store = Store {
            version: SCHEMA_VERSION,
            profiles: vec![Profile {
                id: "1".into(),
                alias: "work".into(),
                name: "Me".into(),
                email: "Me@Example.com".into(),
                host_name: "github.com".into(),
                host_alias: "github.com-work".into(),
                ssh_key_path: "~/.ssh/id_work".into(),
                dirs: vec![],
                created_at: now_iso(),
                updated_at: now_iso(),
            }],
            settings: Settings::default(),
        };
        assert_eq!(store.by_email("me@example.com").unwrap().alias, "work");
        assert!(store.by_email("other@example.com").is_none());
    }
}
