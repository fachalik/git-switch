# Git Switcher

A local, macOS menu bar app for managing several Git identities on one machine.
It manages the config files you would otherwise edit by hand — `~/.ssh/config`,
`~/.gitconfig`, and one `~/.gitconfig-<alias>` per account — and shows in the
menu bar which identity a commit would actually use.

Built with Tauri v2 (Rust) + React + TypeScript + Tailwind. No accounts, no
network calls, no telemetry.

## What it does

| | |
| --- | --- |
| **Manage profiles** | Add, edit, and delete accounts (`alias`, name, email, host, SSH host alias, key path, folders) through a form rather than by editing dotfiles. |
| **Generate the config** | Writes an SSH `Host` stanza per profile and the git `includeIf` rules that map folders to identities. Every write is previewed as a diff first, is idempotent, and backs the original up to `.bak`. |
| **See the active identity** | The menu bar shows the alias of the identity in effect, or a loud **Unregistered** when the current email matches no profile. |
| **Generate SSH keys** | Creates an ed25519 keypair via `ssh-keygen`, then hands you the public key to register with the host. |
| **Move to a new laptop** | Export every profile to one JSON file and import it on the new machine, then regenerate keys there. |

### What it deliberately does not do

* **It does not replace `includeIf`.** Folder-based switching is git's job and
  it already works. This app is a management and visibility layer on top — it
  writes the rules, then gets out of the way.
* **It never handles private key material.** It stores the *path* to a key and
  delegates every crypto operation to `ssh-keygen` and the SSH agent. The app
  never reads a private key, and an export can't contain one.
* **No Keychain integration, no GPG signing, no cloud sync.** Portability is an
  explicit export/import step, not a background service.
* **macOS only.** The tray behaviour and `UseKeychain` in the generated SSH
  config are macOS-specific.

## Getting started

```sh
npm install
npm run tauri dev      # develop
npm run tauri build    # produce Git Switcher.app + a .dmg
```

The build is unsigned and un-notarized. On first launch, right-click the app →
**Open** to get past Gatekeeper.

## How it works

### The files it touches

| Path | Ownership |
| --- | --- |
| `~/.config/gitswitcher/profiles.json` | Owned by the app. The only state it keeps. |
| `~/.ssh/config` | **Shared.** Only the block between the `# >>> gitswitcher managed block >>>` markers is rewritten; everything else is left byte-for-byte alone. |
| `~/.gitconfig` | **Shared**, same marker rule. Holds only the `includeIf` lines. |
| `~/.gitconfig-<alias>` | Owned by the app, regenerated wholesale. Deleting a profile removes its file on the next apply — but only if the file still carries the generated header, so a hand-written `~/.gitconfig-something` is never touched. |

Nothing is written until you press **Review & apply**, and that dialog shows the
exact diff for every file first. Each file is copied to `<name>.bak` before it
is replaced — including on delete.

### Switching identities

Two independent mechanisms, both generated for you:

1. **By folder** — `includeIf "gitdir:~/code/work/"` points at
   `~/.gitconfig-work`, so every repo under that folder commits as that
   identity. Nested folders assigned to another profile still win, because
   includes are emitted shortest-path-first and git's last assignment wins.
2. **By remote** — clone through the host alias
   (`git@github.com-work:owner/repo.git`) and SSH uses that profile's key.
   `IdentitiesOnly yes` is set so the agent can't silently offer a different
   key, which is the usual cause of "pushed as the wrong account".

Each generated `~/.gitconfig-<alias>` also sets `core.sshCommand`, so a folder
rule works even for repos cloned with a plain `github.com` URL.

### Knowing which identity is live

The app never guesses at git's config precedence — it asks git:
`git -C <folder> config --get user.email`, which already accounts for
`includeIf`, repo-local overrides, and everything else. The window also shows
`--show-origin`, so you can see *which file* decided the answer.

Pick a watched folder in the app and the menu bar tracks it (polled every 10
seconds); with none picked it reports your global identity.

## Security

* **Private keys are never read.** The app stores a path. `ssh-keygen` and the
  SSH agent do everything else.
* **Exports carry metadata only** — alias, name, email, host, key *path*,
  folders. There is no code path that can put key material in one.
* **Three binaries may be executed**, ever: `git`, `ssh-keygen`, and `ssh`
  (used only by *Test connection*). They are resolved to absolute paths in a
  fixed list of system directories — `$PATH` is not consulted — and run with an
  argv array, never a shell. Any user-supplied value that could be read as a
  flag is rejected. See [`exec.rs`](src-tauri/src/exec.rs).
* **The webview holds no privileged permissions.** It has no filesystem or
  shell access; it can only call the Rust commands that exist. See
  [`capabilities/default.json`](src-tauri/capabilities/default.json).
* **Input is validated as config-injection input**, because that's what it is.
  A newline in a display name would otherwise inject a section into a git
  config; aliases are restricted to a charset that can't escape the
  `~/.gitconfig-<alias>` filename.
* **Keys are generated without a passphrase.** Passing one to `ssh-keygen`
  would put it in the process list, visible to everything on the machine. Add
  one afterwards with `ssh-keygen -p -f <key>` if you want it.

## Layout

```
src-tauri/src/
  lib.rs        app setup, plugins, window behaviour
  commands.rs   the IPC surface — thin wrappers over the modules below
  model.rs      profile types + validation
  store.rs      profiles.json persistence
  paths.rs      every path the app may touch, in one place
  fsx.rs        atomic writes, .bak backups, managed-block editing
  exec.rs       the only place that starts a process
  sshcfg.rs     ~/.ssh/config generation
  gitcfg.rs     ~/.gitconfig + include file generation
  apply.rs      preview/apply planning, orphan cleanup
  keygen.rs     ssh-keygen, key health, connection test
  status.rs     "which identity is active?"
  portable.rs   export / import
  tray.rs       menu bar

src/
  App.tsx       state and orchestration
  lib/          typed invoke wrappers, shared types, diff
  components/   status strip, sidebar, profile form, key panel, modals
```

## Tests

```sh
cd src-tauri && cargo test
```

The interesting one is
[`tests/config_files.rs`](src-tauri/tests/config_files.rs): it runs the whole
write path against a throwaway `$HOME` seeded with a pre-existing
`~/.ssh/config` and `~/.gitconfig`, and asserts that the user's own content
survives, that the preview matches what actually lands on disk, that applying
twice is a no-op, that removing every profile restores the original file
exactly, and that a crafted export can't inject config syntax.

## Decisions worth knowing about

These differ from, or resolve, what the spec left open.

**Multi-host is supported.** Each profile has its own `host` (`github.com`,
`gitlab.com`, `bitbucket.org`, a self-hosted GitLab…), so nothing is
GitHub-specific. The *Open host keys* button knows where each of the three
common hosts keeps its SSH key settings.

**Auto-detecting a profile from the remote URL is not built**, as specified.
The repo's remote is *displayed* when you watch a folder, because it's useful
context, but the app never picks a profile for you.

**No auto-updater.** Rebuild with `npm run tauri build` when you want a new
version. An updater would need a hosting endpoint and signing keys, which
reintroduces exactly the maintenance burden a local tool is meant to avoid.

**A missing SSH key is a warning, not a validation error.** The spec asked for
"key path exists" validation, but enforcing it at save time makes the built-in
key generator unusable — you'd have to create the key before you could save the
profile that says where the key goes. Instead the profile saves, and the key's
status is shown next to it (**Not generated yet**, plus a warning in the
sidebar) with a *Generate key* button right there. Permissions that are too
open are flagged the same way, since ssh will refuse such a key.

**`ssh` is a third whitelisted binary.** The spec named `ssh-keygen` and `git`.
*Test connection* runs `ssh -T git@<host-alias>` with a fixed argument list,
which is what turns "I think this is set up" into "this account authenticates".
It runs with `BatchMode=yes` so it can never block on a prompt, and
`StrictHostKeyChecking=accept-new`, which trusts a host key on first contact —
the standard trade-off for this check.

**The menu bar tracks a folder you pick, not your terminal's folder.** An app
can't see what directory another process is sitting in without something
invasive like a shell hook. Choose a folder in the app (recent ones are kept
one click away) and the menu bar follows it; with none chosen it reports your
global identity.
