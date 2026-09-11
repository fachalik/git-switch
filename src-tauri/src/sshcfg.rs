//! Generates the `~/.ssh/config` managed block.
//!
//! One `Host` stanza per profile, all inside a single marked region so the
//! user's own entries above and below it are never touched.

use crate::error::Result;
use crate::fsx;
use crate::model::Profile;
use crate::paths;
use std::path::PathBuf;

pub fn render_block(profiles: &[Profile]) -> Result<String> {
    let mut out = String::new();
    for profile in profiles {
        out.push_str(&format!("\n# profile: {}\n", profile.alias));
        // `host_alias` and `host_name` go in bare: validate_host already limits
        // them to [A-Za-z0-9._-], which needs no quoting.
        out.push_str(&format!("Host {}\n", profile.host_alias));
        out.push_str(&format!("    HostName {}\n", profile.host_name));
        out.push_str("    User git\n");
        out.push_str(&format!(
            "    IdentityFile {}\n",
            fsx::ssh_quote(&profile.ssh_key_path)?
        ));
        // Without IdentitiesOnly, ssh offers every key in the agent and the
        // server picks the first that authenticates — which is exactly the
        // "wrong account" failure this app exists to prevent.
        out.push_str("    IdentitiesOnly yes\n");
        out.push_str("    AddKeysToAgent yes\n");
        out.push_str("    UseKeychain yes\n");
    }
    Ok(out.trim_start_matches('\n').to_string())
}

/// The full file contents we would write, given what's on disk right now.
pub fn render_file(profiles: &[Profile]) -> Result<(PathBuf, String, String)> {
    let path = paths::ssh_config_path()?;
    let before = fsx::read_or_empty(&path)?;
    let after = fsx::upsert_block(&before, &render_block(profiles)?);
    Ok((path, before, after))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::now_iso;

    fn profile(alias: &str) -> Profile {
        Profile {
            id: alias.into(),
            alias: alias.into(),
            name: "Me".into(),
            email: format!("{alias}@example.com"),
            host_name: "github.com".into(),
            host_alias: format!("github.com-{alias}"),
            ssh_key_path: format!("~/.ssh/id_{alias}"),
            dirs: vec![],
            created_at: now_iso(),
            updated_at: now_iso(),
        }
    }

    #[test]
    fn renders_one_stanza_per_profile() {
        let block = render_block(&[profile("work"), profile("personal")]).unwrap();
        assert!(block.contains("Host github.com-work"));
        assert!(block.contains("Host github.com-personal"));
        assert_eq!(block.matches("HostName github.com").count(), 2);
    }

    #[test]
    fn pins_the_key_so_the_agent_cannot_offer_the_wrong_one() {
        let block = render_block(&[profile("work")]).unwrap();
        // Always quoted, so a space or '#' in the path cannot change the line.
        assert!(block.contains("IdentityFile \"~/.ssh/id_work\""));
        assert!(block.contains("IdentitiesOnly yes"));
    }

    #[test]
    fn no_profiles_renders_nothing() {
        assert_eq!(render_block(&[]).unwrap(), "");
    }

    #[test]
    fn refuses_a_key_path_it_cannot_represent() {
        // ssh_config has no escape for a quote inside a quoted argument, so
        // emitting anything here would mean something we did not intend.
        let mut evil = profile("work");
        evil.ssh_key_path = "~/.ssh/id\"x".into();
        assert!(render_block(&[evil]).is_err());
    }
}
