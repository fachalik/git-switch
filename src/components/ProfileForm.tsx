import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Profile, ProfileInput } from "../lib/types";
import { Button, Field, Input } from "./ui";

const BLANK: ProfileInput = {
  alias: "",
  name: "",
  email: "",
  hostName: "github.com",
  hostAlias: "",
  sshKeyPath: "",
  dirs: [],
};

function toInput(profile: Profile): ProfileInput {
  return {
    alias: profile.alias,
    name: profile.name,
    email: profile.email,
    hostName: profile.hostName,
    hostAlias: profile.hostAlias,
    sshKeyPath: profile.sshKeyPath,
    dirs: profile.dirs,
  };
}

function sameAs(a: ProfileInput, b: ProfileInput) {
  return (
    a.alias === b.alias &&
    a.name === b.name &&
    a.email === b.email &&
    a.hostName === b.hostName &&
    a.hostAlias === b.hostAlias &&
    a.sshKeyPath === b.sshKeyPath &&
    a.dirs.length === b.dirs.length &&
    a.dirs.every((dir, index) => dir === b.dirs[index])
  );
}

/** Slug a freshly typed alias into the conventional derived values. */
function derived(alias: string, hostName: string) {
  const slug = alias.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return {
    hostAlias: slug ? `${hostName}-${slug}` : "",
    sshKeyPath: slug ? `~/.ssh/id_ed25519_${slug}` : "",
  };
}

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  onDelete,
  busy,
}: {
  /** `null` means "new profile". */
  profile: Profile | null;
  onSave: (input: ProfileInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const initial = profile ? toInput(profile) : BLANK;
  const [draft, setDraft] = useState<ProfileInput>(initial);
  // Only auto-fill derived fields until the user takes them over.
  const [autoFill, setAutoFill] = useState(profile === null);

  useEffect(() => {
    setDraft(profile ? toInput(profile) : BLANK);
    setAutoFill(profile === null);
  }, [profile]);

  const dirty = !sameAs(draft, initial);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setAlias(alias: string) {
    setDraft((current) => {
      if (!autoFill) return { ...current, alias };
      const fill = derived(alias, current.hostName);
      return { ...current, alias, ...fill };
    });
  }

  function setHostName(hostName: string) {
    setDraft((current) => {
      if (!autoFill) return { ...current, hostName };
      return { ...current, hostName, ...derived(current.alias, hostName) };
    });
  }

  async function pickKey() {
    const picked = await open({
      multiple: false,
      title: "Choose the private key",
      defaultPath: "~/.ssh",
    });
    if (typeof picked === "string") {
      setAutoFill(false);
      set("sshKeyPath", picked);
    }
  }

  async function addFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Use this identity in…",
    });
    if (typeof picked === "string" && !draft.dirs.includes(picked)) {
      set("dirs", [...draft.dirs, picked]);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <section className="flex flex-col gap-4">
            <h3 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              Identity
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Alias"
                hint="Short handle for this account. Also names ~/.gitconfig-<alias>."
              >
                <Input
                  value={draft.alias}
                  onChange={setAlias}
                  placeholder="work"
                  mono
                />
              </Field>
              <Field label="Commit name" hint="Shows up as the commit author.">
                <Input
                  value={draft.name}
                  onChange={(value) => set("name", value)}
                  placeholder="Jane Doe"
                />
              </Field>
            </div>
            <Field
              label="Commit email"
              hint="Must match an email registered with the host, or your commits won't be linked to your account."
            >
              <Input
                value={draft.email}
                onChange={(value) => set("email", value)}
                placeholder="jane@company.com"
                mono
              />
            </Field>
          </section>

          <section className="flex flex-col gap-4 border-t border-line pt-5">
            <h3 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              SSH
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Host" hint="github.com, gitlab.com, bitbucket.org…">
                <Input
                  value={draft.hostName}
                  onChange={setHostName}
                  placeholder="github.com"
                  mono
                />
              </Field>
              <Field
                label="Host alias"
                hint="Clone with git@<alias>:owner/repo.git to pin this key."
              >
                <Input
                  value={draft.hostAlias}
                  onChange={(value) => {
                    setAutoFill(false);
                    set("hostAlias", value);
                  }}
                  placeholder="github.com-work"
                  mono
                />
              </Field>
            </div>
            <Field
              label="Private key"
              hint="The app only stores this path. It never reads your private key."
            >
              <div className="flex items-center gap-2">
                <Input
                  value={draft.sshKeyPath}
                  onChange={(value) => {
                    setAutoFill(false);
                    set("sshKeyPath", value);
                  }}
                  placeholder="~/.ssh/id_ed25519_work"
                  mono
                />
                <Button onClick={pickKey}>Browse…</Button>
              </div>
            </Field>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                Use in these folders
              </h3>
              <Button onClick={addFolder}>Add folder…</Button>
            </div>
            <p className="text-[11px] leading-snug text-ink-faint">
              Every repo under these folders commits as this identity, via git's{" "}
              <code className="font-mono">includeIf</code>. A nested folder
              assigned to another profile still wins over its parent.
            </p>
            {draft.dirs.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-faint">
                No folders yet — this profile will only apply when you clone
                through its host alias.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {draft.dirs.map((dir) => (
                  <li
                    key={dir}
                    className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5"
                  >
                    <span className="truncate font-mono text-[11px] text-ink">
                      {dir}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "dirs",
                          draft.dirs.filter((entry) => entry !== dir),
                        )
                      }
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-ink-faint hover:bg-bad-soft hover:text-bad"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line bg-sunken px-5 py-3">
        <div>
          {onDelete ? (
            <Button variant="danger" onClick={onDelete} disabled={busy}>
              Delete profile
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-[11px] text-ink-faint">Unsaved changes</span>
          ) : null}
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {profile ? "Revert" : "Cancel"}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            {profile ? "Save changes" : "Create profile"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
