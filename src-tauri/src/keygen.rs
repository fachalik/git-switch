//! SSH key generation and health checks.
//!
//! The app never reads, parses, or copies private key material. It shells out
//! to `ssh-keygen`, then only ever looks at the `.pub` half.
//!
//! Keys are generated without a passphrase. Passing one on the command line
//! would expose it in the process list to every process on the machine, so the
//! app doesn't offer it — the UI points at `ssh-keygen -p` for that instead.

use crate::error::{AppError, IoCtx, Result};
use crate::exec;
use crate::fsx;
use crate::model::Profile;
use crate::paths;
use serde::Serialize;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyHealth {
    pub profile_id: String,
    pub private_key_path: String,
    pub public_key_path: String,
    pub private_key_exists: bool,
    pub public_key_exists: bool,
    /// `true` when the private key's mode is stricter than 0o077 — ssh will
    /// refuse to use it otherwise.
    pub permissions_ok: bool,
    pub fingerprint: Option<String>,
    pub public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedKey {
    pub private_key_path: String,
    pub public_key_path: String,
    pub public_key: String,
    pub fingerprint: Option<String>,
}

fn fingerprint(public_key_path: &Path) -> Option<String> {
    let path = public_key_path.to_str()?;
    let run = exec::run("ssh-keygen", &["-l", "-f", path], None).ok()?;
    run.trimmed_stdout()
}

pub fn health(profile: &Profile) -> Result<KeyHealth> {
    let private = paths::expand_within_home(&profile.ssh_key_path)?;
    let public = paths::public_key_path(&private);

    let private_exists = private.is_file();
    let public_exists = public.is_file();

    let permissions_ok = if private_exists {
        std::fs::metadata(&private)
            .map(|m| m.permissions().mode() & 0o077 == 0)
            .unwrap_or(false)
    } else {
        true
    };

    let public_key = if public_exists {
        fsx::read_opt(&public)?.map(|s| s.trim().to_string())
    } else {
        None
    };

    Ok(KeyHealth {
        profile_id: profile.id.clone(),
        private_key_path: paths::contract(&private),
        public_key_path: paths::contract(&public),
        private_key_exists: private_exists,
        public_key_exists: public_exists,
        permissions_ok,
        fingerprint: public_exists.then(|| fingerprint(&public)).flatten(),
        public_key,
    })
}

/// Generate an ed25519 keypair at the profile's configured path.
///
/// Refuses to clobber an existing key unless `overwrite` is set — losing a
/// private key means losing access to everything it authenticates.
pub fn generate(profile: &Profile, overwrite: bool) -> Result<GeneratedKey> {
    let private = paths::expand_within_home(&profile.ssh_key_path)?;
    let public = paths::public_key_path(&private);

    if private.exists() && !overwrite {
        return Err(AppError::conflict(format!(
            "a key already exists at {} — generating a new one would replace it",
            paths::contract(&private)
        )));
    }

    if let Some(parent) = private.parent() {
        fsx::ensure_dir(parent, 0o700)?;
    }

    // ssh-keygen will not overwrite non-interactively, so clear the way
    // ourselves — backing up first, because this is irreversible otherwise.
    if private.exists() {
        fsx::backup(&private)?;
        std::fs::remove_file(&private).ctx(format!("removing {}", private.display()))?;
    }
    if public.exists() {
        fsx::backup(&public)?;
        std::fs::remove_file(&public).ctx(format!("removing {}", public.display()))?;
    }

    let key_arg = private
        .to_str()
        .ok_or_else(|| AppError::validation("key path is not valid UTF-8"))?;
    let comment = format!("{} ({})", profile.email, profile.alias);

    exec::run_checked(
        "ssh-keygen",
        &[
            "-t",
            "ed25519",
            "-f",
            exec::safe_value(key_arg)?,
            "-C",
            exec::safe_value(&comment)?,
            // Empty passphrase, and no prompt of any kind.
            "-N",
            "",
            "-q",
        ],
        None,
    )?;

    std::fs::set_permissions(&private, std::fs::Permissions::from_mode(0o600))
        .ctx(format!("securing {}", private.display()))?;

    let public_key = fsx::read_opt(&public)?
        .ok_or_else(|| AppError::command("ssh-keygen did not produce a public key"))?
        .trim()
        .to_string();

    Ok(GeneratedKey {
        private_key_path: paths::contract(&private),
        public_key_path: paths::contract(&public),
        fingerprint: fingerprint(&public),
        public_key,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTest {
    pub ok: bool,
    pub host_alias: String,
    pub output: String,
}

/// `ssh -T git@<alias>` — the standard "does this key reach the right
/// account?" check. Git hosts answer with the account name and exit non-zero,
/// so the account line in the output is the real result, not the exit code.
pub fn test_connection(host_alias: &str) -> Result<SshTest> {
    let target = format!("git@{}", crate::model::validate_host("host alias", host_alias)?);
    let run = exec::run(
        "ssh",
        &[
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "StrictHostKeyChecking=accept-new",
            exec::safe_value(&target)?,
        ],
        None,
    )?;

    let output = if run.stderr.trim().is_empty() {
        run.stdout.trim().to_string()
    } else {
        run.stderr.trim().to_string()
    };

    // GitHub greets with "Hi <user>! You've successfully authenticated" and
    // exits 1 because it provides no shell; GitLab and Bitbucket are similar.
    let ok = run.ok()
        || output.contains("successfully authenticated")
        || output.starts_with("Hi ")
        || output.contains("Welcome to GitLab")
        || output.contains("logged in as");

    Ok(SshTest {
        ok,
        host_alias: host_alias.to_string(),
        output,
    })
}
