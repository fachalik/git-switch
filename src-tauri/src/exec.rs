//! The only place in the app that starts a process.
//!
//! Three rules, enforced here rather than at call sites:
//!   * the binary must be one of [`ALLOWED`], resolved to an absolute path in
//!     a fixed set of system directories (never via `$PATH`);
//!   * arguments are passed as an argv array — no shell, so no word splitting,
//!     globbing, or `;` injection is possible;
//!   * user-derived argument values may not start with `-`, so a crafted alias
//!     or path can't smuggle in an extra flag.

use crate::error::{AppError, IoCtx, Result};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// Binaries this app is permitted to execute, and nothing else.
const ALLOWED: &[&str] = &["git", "ssh-keygen", "ssh"];

/// Searched in order. `$PATH` is deliberately not consulted.
const BIN_DIRS: &[&str] = &["/usr/bin", "/bin", "/usr/local/bin", "/opt/homebrew/bin"];

fn resolve(bin: &str) -> Result<PathBuf> {
    if !ALLOWED.contains(&bin) {
        return Err(AppError::command(format!(
            "{bin} is not an allowed command"
        )));
    }
    BIN_DIRS
        .iter()
        .map(|dir| Path::new(dir).join(bin))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| AppError::command(format!("could not find {bin} on this system")))
}

/// Guard for any argument value that came from user input.
pub fn safe_value(value: &str) -> Result<&str> {
    if value.starts_with('-') {
        return Err(AppError::validation(format!(
            "value may not start with '-': {value}"
        )));
    }
    if value.contains('\0') {
        return Err(AppError::validation("value contains a null byte"));
    }
    Ok(value)
}

pub struct Run {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

impl Run {
    pub fn ok(&self) -> bool {
        self.status == 0
    }

    /// stdout with trailing newline removed, or `None` when the command failed
    /// or printed nothing. Most `git config --get` reads want exactly this.
    pub fn trimmed_stdout(&self) -> Option<String> {
        if !self.ok() {
            return None;
        }
        let s = self.stdout.trim();
        (!s.is_empty()).then(|| s.to_string())
    }
}

fn finish(output: Output) -> Run {
    Run {
        status: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

/// Run a whitelisted binary. A non-zero exit is returned as `Ok(Run)` — the
/// caller decides whether that's an error (many `git config` reads exit 1
/// simply because a key is unset).
pub fn run(bin: &str, args: &[&str], cwd: Option<&Path>) -> Result<Run> {
    let program = resolve(bin)?;
    let mut cmd = Command::new(&program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    // Keep git from opening an editor or a credential prompt behind our back.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_EDITOR", "true");

    let output = cmd
        .output()
        .ctx(format!("running {}", program.display()))?;
    Ok(finish(output))
}

/// Run a whitelisted binary and treat a non-zero exit as an error.
pub fn run_checked(bin: &str, args: &[&str], cwd: Option<&Path>) -> Result<Run> {
    let result = run(bin, args, cwd)?;
    if !result.ok() {
        let detail = if result.stderr.trim().is_empty() {
            result.stdout.trim().to_string()
        } else {
            result.stderr.trim().to_string()
        };
        return Err(AppError::command(format!(
            "{bin} exited with status {}: {detail}",
            result.status
        )));
    }
    Ok(result)
}
