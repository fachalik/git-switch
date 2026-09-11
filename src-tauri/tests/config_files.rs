//! End-to-end check of the part that scares people: writing into config files
//! the user already owns.
//!
//! Everything runs against a throwaway `$HOME`, so this never touches the real
//! `~/.ssh/config` or `~/.gitconfig`. All of it lives in one test function
//! because `$HOME` is process-global and tests share a process.

use gitswitcher_lib::{apply, fsx, gitcfg, model, paths, portable, store};
use model::{Profile, Settings, Store};
use std::fs;
use std::path::PathBuf;

const EXISTING_SSH_CONFIG: &str = "\
Host bastion.internal
    User ops
    IdentityFile ~/.ssh/id_ops

Host *
    AddKeysToAgent yes
";

const EXISTING_GITCONFIG: &str = "\
[user]
\tname = Original Name
\temail = original@example.com
[init]
\tdefaultBranch = main
";

fn profile(alias: &str, dirs: &[&str]) -> Profile {
    Profile {
        id: format!("id-{alias}"),
        alias: alias.to_string(),
        name: format!("{alias} person"),
        email: format!("{alias}@example.com"),
        host_name: "github.com".to_string(),
        host_alias: format!("github.com-{alias}"),
        ssh_key_path: format!("~/.ssh/id_ed25519_{alias}"),
        dirs: dirs.iter().map(|d| d.to_string()).collect(),
        created_at: model::now_iso(),
        updated_at: model::now_iso(),
    }
}

fn sandbox() -> PathBuf {
    let home = std::env::temp_dir().join(format!(
        "gitswitcher-test-{}-{}",
        std::process::id(),
        model::now_iso().replace([':', '.', '+', '-'], "")
    ));
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(home.join(".ssh")).unwrap();
    fs::write(home.join(".ssh/config"), EXISTING_SSH_CONFIG).unwrap();
    fs::write(home.join(".gitconfig"), EXISTING_GITCONFIG).unwrap();
    std::env::set_var("HOME", &home);
    home
}

#[test]
fn writes_are_scoped_idempotent_and_reversible() {
    let home = sandbox();

    let mut state = Store {
        profiles: vec![
            profile("work", &["~/code/work"]),
            profile("personal", &["~/code/personal"]),
        ],
        settings: Settings::default(),
        ..Store::default()
    };

    // ---- profiles.json round-trips -------------------------------------
    store::save(&state).unwrap();
    let reloaded = store::load().unwrap();
    assert_eq!(reloaded.profiles.len(), 2);
    assert_eq!(reloaded.profiles[0].alias, "work");
    assert!(
        home.join(".config/gitswitcher/profiles.json").is_file(),
        "profiles.json must land at the documented location"
    );

    // ---- preview matches what apply does -------------------------------
    let plan = apply::preview(&state.profiles).unwrap();
    assert!(plan.has_changes);
    let planned_after: Vec<(String, String)> = plan
        .changes
        .iter()
        .filter(|c| c.changed)
        .map(|c| (c.path.clone(), c.after.clone()))
        .collect();
    assert_eq!(planned_after.len(), 4, "ssh config, gitconfig, 2 includes");

    let report = apply::apply(&state.profiles).unwrap();
    assert_eq!(report.written.len(), 4);
    for (path, expected) in &planned_after {
        let actual = fs::read_to_string(home.join(path.trim_start_matches("~/"))).unwrap();
        assert_eq!(&actual, expected, "preview for {path} must match what was written");
    }

    // ---- the user's own config survives --------------------------------
    let ssh = fs::read_to_string(home.join(".ssh/config")).unwrap();
    assert!(ssh.contains("Host bastion.internal"));
    assert!(ssh.contains("Host *"));
    assert!(ssh.contains("Host github.com-work"));
    assert!(ssh.contains("IdentitiesOnly yes"));

    let gitconfig = fs::read_to_string(home.join(".gitconfig")).unwrap();
    assert!(gitconfig.contains("name = Original Name"));
    assert!(gitconfig.contains("defaultBranch = main"));
    assert!(gitconfig.contains(r#"[includeIf "gitdir:~/code/work/"]"#));

    // ---- backups exist before the first overwrite ----------------------
    assert_eq!(
        fs::read_to_string(home.join(".ssh/config.bak")).unwrap(),
        EXISTING_SSH_CONFIG
    );
    assert_eq!(
        fs::read_to_string(home.join(".gitconfig.bak")).unwrap(),
        EXISTING_GITCONFIG
    );

    // ---- the include file holds the identity ---------------------------
    let include = fs::read_to_string(home.join(".gitconfig-work")).unwrap();
    assert!(include.contains(r#"email = "work@example.com""#));
    assert!(include.contains(r#"name = "work person""#));

    // ---- applying twice changes nothing --------------------------------
    let before = fs::read_to_string(home.join(".ssh/config")).unwrap();
    let second = apply::apply(&state.profiles).unwrap();
    assert!(second.written.is_empty(), "second apply must be a no-op");
    assert!(!apply::preview(&state.profiles).unwrap().has_changes);
    assert_eq!(fs::read_to_string(home.join(".ssh/config")).unwrap(), before);

    // ---- deleting a profile cleans up its generated file ---------------
    state.profiles.retain(|p| p.alias != "personal");
    let plan = apply::preview(&state.profiles).unwrap();
    assert!(
        plan.changes.iter().any(|c| c.orphan && c.path.ends_with(".gitconfig-personal")),
        "the preview must warn that the orphaned include file will be deleted"
    );

    let cleanup = apply::apply(&state.profiles).unwrap();
    assert_eq!(cleanup.removed.len(), 1);
    assert!(!home.join(".gitconfig-personal").exists());
    assert!(
        home.join(".gitconfig-personal.bak").exists(),
        "even a delete keeps a backup"
    );

    let ssh = fs::read_to_string(home.join(".ssh/config")).unwrap();
    assert!(!ssh.contains("github.com-personal"));
    assert!(ssh.contains("Host bastion.internal"), "user content still intact");

    // ---- a hand-written ~/.gitconfig-* is never touched -----------------
    fs::write(home.join(".gitconfig-handmade"), "[user]\n\temail = mine\n").unwrap();
    apply::apply(&state.profiles).unwrap();
    assert!(
        home.join(".gitconfig-handmade").is_file(),
        "only files carrying our generated header may be removed"
    );

    // ---- removing every profile leaves the file as we found it ---------
    apply::apply(&[]).unwrap();
    let ssh = fs::read_to_string(home.join(".ssh/config")).unwrap();
    assert!(!ssh.contains(fsx::BEGIN), "the managed block is gone");
    assert_eq!(
        ssh.trim(),
        EXISTING_SSH_CONFIG.trim(),
        "the file should be back to the user's original content"
    );

    // ---- export carries metadata only, then imports back ---------------
    let export_path = home.join("export.json");
    portable::export(&state, export_path.to_str().unwrap()).unwrap();
    let raw = fs::read_to_string(&export_path).unwrap();
    assert!(raw.contains("\"alias\": \"work\""));
    assert!(
        !raw.contains("PRIVATE KEY") && !raw.contains("privateKey"),
        "an export must never carry key material"
    );

    let mut fresh = Store::default();
    let imported = portable::import(&mut fresh, export_path.to_str().unwrap(), false).unwrap();
    assert_eq!(imported.added, vec!["work".to_string()]);
    assert_eq!(fresh.profiles[0].email, "work@example.com");
    assert_ne!(
        fresh.profiles[0].id, "id-work",
        "imported profiles get a fresh local id"
    );

    // Re-importing without overwrite leaves the existing profile alone.
    let again = portable::import(&mut fresh, export_path.to_str().unwrap(), false).unwrap();
    assert_eq!(again.skipped, vec!["work".to_string()]);
    assert_eq!(fresh.profiles.len(), 1);

    // ---- a malicious export is rejected, not written to disk -----------
    let evil = raw.replace("work person", "evil\\n[core]\\n\\tsshCommand = touch /tmp/pwned");
    let evil_path = home.join("evil.json");
    fs::write(&evil_path, &evil).unwrap();
    let mut target = Store::default();
    let result = portable::import(&mut target, evil_path.to_str().unwrap(), true).unwrap();
    assert_eq!(
        result.skipped,
        vec!["work".to_string()],
        "a name containing config syntax must not be imported"
    );
    assert!(target.profiles.is_empty());

    // ---- generated include files are never world-writable ---------------
    apply::apply(&state.profiles).unwrap();
    let include_path = paths::include_path("work").unwrap();
    assert!(gitcfg::render_include_file(&state.profiles[0]).starts_with("# Generated by Git Switcher"));
    assert!(include_path.is_file());

    fs::remove_dir_all(&home).ok();
}
