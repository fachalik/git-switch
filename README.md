# Git Switcher

A macOS menu bar app for juggling several Git identities on one machine — work,
personal, a client — without editing dotfiles by hand or pushing a commit as
the wrong account.

It manages the three things that make multi-account git work (`~/.ssh/config`,
`~/.gitconfig`, and one `~/.gitconfig-<alias>` per account), previews every
change as a diff before writing it, and shows in the menu bar which identity a
commit would actually use right now.

Local-only: no accounts, no network calls, no telemetry. Built with Tauri v2
(Rust) + React + TypeScript + Tailwind + shadcn/ui.

---

## The problem

You clone a repo, work for an hour, push — and the commits are attributed to
your personal email on a work repo. The fix is well known: SSH host aliases,
plus git's `includeIf` to pick an identity per folder. The catch is that it
lives across three config files, is easy to get subtly wrong, and gives you no
feedback until a commit lands under the wrong name.

Git Switcher writes those files for you, and answers the one question the
config never does out loud: **who am I right now?**

## What it does

| | |
| --- | --- |
| **Manage profiles** | Add, edit, and delete accounts (alias, name, email, host, SSH host alias, key path, folders) through a form instead of dotfiles. |
| **Generate the config** | Writes an SSH `Host` stanza per profile plus the git `includeIf` rules mapping folders to identities. Every write is previewed as a diff, is idempotent, and backs up the original to `.bak`. |
| **Set the global identity** | Pick which profile supplies the global `[user]` name and email — the fallback for every repo no folder rule covers. |
| **See the active identity** | The menu bar shows the alias in effect, or a loud **Unregistered** when the current email matches no profile. |
| **Generate SSH keys** | Creates an ed25519 keypair via `ssh-keygen` and hands you the public key to register with the host. |
| **Move to a new laptop** | Export every profile to one JSON file, import it on the new machine, regenerate keys there. |

## Requirements

* macOS 10.15 or later (the tray behaviour and `UseKeychain` in the generated
  SSH config are macOS-specific)
* [Node.js](https://nodejs.org) 20.19+ or 22.12+
* [Rust](https://rustup.rs) (stable) and Xcode Command Line Tools —
  `xcode-select --install`

## Install

There are no prebuilt releases yet; build it from source.

```sh
git clone https://github.com/fachalik/git-switch.git
cd git-switch
npm install

npm run tauri dev      # run it in development
npm run tauri build    # produce "Git Switcher.app" + a .dmg
```

The bundle lands in `src-tauri/target/release/bundle/`. It is unsigned and
un-notarized, so on first launch right-click the app → **Open** to get past
Gatekeeper.

## First run

1. **Add a profile.** Give it an alias (`work`), your commit name and email,
   and the host your repos live on (`github.com`, `gitlab.com`, …). The SSH
   host alias defaults to `github.com-work` — that's the hostname you'll clone
   through for this account.
2. **Generate a key.** If the key path doesn't exist yet, the panel says
   *Not generated yet* — press **Generate key**, then copy the public key and
   add it to your account on the host (the `github.com keys` button opens the
   right settings page).
3. **Pick the folders.** Under *Use this identity in…*, choose the directories
   this account owns — say `~/code/work`. Anything cloned under there commits
   as this identity.
4. **Choose a global identity.** Whichever profile should be the fallback for
   every repo no folder rule covers. Leave it unmanaged and the app won't touch
   your `[user]` section at all.
5. **Review & apply.** The dialog shows the exact diff for every file it wants
   to write. Nothing touches disk until you confirm.

Then **Test connection** verifies the account authenticates, and **Watch a
folder** points the menu bar at a directory so it reports the identity live.

Clone through the host alias to use that profile's key:

```sh
git clone git@github.com-work:owner/repo.git
```

## How it works

### The files it touches

| Path | Ownership |
| --- | --- |
| `~/.config/gitswitcher/profiles.json` | Owned by the app. The only state it keeps. |
| `~/.ssh/config` | **Shared.** Only the block between the `# >>> gitswitcher managed block >>>` markers is rewritten; everything else is left byte-for-byte alone. |
| `~/.gitconfig` | **Shared**, same marker rule. Holds the global `[user]` identity (when you set one) followed by the `includeIf` lines. |
| `~/.gitconfig-<alias>` | Owned by the app, regenerated wholesale. Deleting a profile removes its file on the next apply — but only if the file still carries the generated header, so a hand-written `~/.gitconfig-something` is never touched. |

Each file is copied to `<name>.bak` before it is replaced, including on delete.

### Switching identities

Three layers, generated for you, from most general to most specific:

0. **The global identity** — the profile you select under *Global identity*.
   It applies to every repo that nothing more specific covers.
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

The ordering inside the managed block is load-bearing: the global `[user]`
section is written **before** the `includeIf` lines, because git takes the last
assignment that matches. Global is the fallback; a folder rule is the specific
answer, and it wins.

That same rule cuts the other way for config you wrote yourself. If your
`~/.gitconfig` sets `user.email` *below* the managed block, your section wins
and the global identity you picked would quietly do nothing — so the apply
dialog says so instead of letting you believe it worked. A `[user]` section
*above* the block is fine: the app's comes later and takes precedence, and the
dialog notes that too.

### Knowing which identity is live

The app never guesses at git's config precedence — it asks git:
`git -C <folder> config --get user.email`, which already accounts for
`includeIf`, repo-local overrides, and everything else. The window also shows
`--show-origin`, so you can see *which file* decided the answer.

Pick a watched folder and the menu bar tracks it (polled every 10 seconds);
with none picked it reports your global identity.

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

## What it deliberately does not do

* **It does not replace `includeIf`.** Folder-based switching is git's job and
  it already works. This app is a management and visibility layer on top — it
  writes the rules, then gets out of the way.
* **It never handles private key material.** It stores the *path* to a key and
  delegates every crypto operation to `ssh-keygen` and the SSH agent.
* **It does not pick a profile for you.** A repo's remote is *displayed* when
  you watch a folder, because that's useful context, but auto-detecting an
  identity from the remote URL is not built.
* **No Keychain integration, no GPG signing, no cloud sync.** Portability is an
  explicit export/import step, not a background service.
* **No auto-updater.** Rebuild with `npm run tauri build` when you want a new
  version. An updater needs a hosting endpoint and signing keys, which
  reintroduces exactly the maintenance burden a local tool avoids.
* **macOS only**, for now.

## Development

```sh
npm install
npm run tauri dev             # hot-reloading app
npm run build                 # type-check + build the frontend
cd src-tauri && cargo test    # Rust tests
```

### Layout

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
  hooks/        overview, profile editor, key, apply, import/export
  lib/          typed invoke wrappers, shared types, diff, formatting
  components/   status strip, sidebar, profile form, key panel, modals
  components/ui shadcn/ui primitives
```

### Tests

The interesting one is
[`tests/config_files.rs`](src-tauri/tests/config_files.rs): it runs the whole
write path against a throwaway `$HOME` seeded with a pre-existing `~/.ssh/config`
and `~/.gitconfig`, and asserts that the user's own content survives, that the
preview matches what actually lands on disk, that applying twice is a no-op,
that removing every profile restores the original file exactly, and that a
crafted export can't inject config syntax.

## FAQ

**A profile saved with a missing SSH key — is that a bug?**
No. Enforcing "key exists" at save time would make the built-in key generator
unusable: you'd have to create the key before you could save the profile that
says where it goes. The profile saves, and the key's status is shown next to it
(**Not generated yet**, plus a warning in the sidebar) with a *Generate key*
button right there. Permissions that are too open are flagged the same way,
since ssh will refuse such a key.

**Does it work with GitLab, Bitbucket, or self-hosted?**
Yes. Each profile has its own host, so nothing is GitHub-specific, and the
`<host> keys` button knows where the three common hosts keep their SSH key
settings.

**Why doesn't the menu bar follow my terminal's directory?**
An app can't see what directory another process is sitting in without something
invasive like a shell hook. Choose a folder in the app (recent ones stay one
click away) and the menu bar follows it; with none chosen it reports your
global identity.

**What does *Test connection* actually run?**
`ssh -T git@<host-alias>` with a fixed argument list, `BatchMode=yes` so it can
never block on a prompt, and `StrictHostKeyChecking=accept-new`, which trusts a
host key on first contact — the standard trade-off for this check.
