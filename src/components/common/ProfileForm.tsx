import { useEffect, useId, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderPlus, LoaderCircle, Trash2, X } from "lucide-react";

import { plural } from "@/lib/format";
import { GIT_HOST_PROVIDERS, isKnownHostName } from "@/lib/hosts";
import type { Profile, ProfileInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/** Picker entry for anything the app doesn't ship a preset for. */
const CUSTOM_HOST = "__custom__";

/** Fields holding an identifier, not prose — nothing should rewrite them. */
const LITERAL_INPUT = {
  spellCheck: false,
  autoCapitalize: "off",
  autoCorrect: "off",
} as const;

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
  saving,
  deleting,
  busy,
}: {
  /** `null` means "new profile". */
  profile: Profile | null;
  onSave: (input: ProfileInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  deleting?: boolean;
  busy: boolean;
}) {
  const ids = useId();
  const initial = useMemo(() => (profile ? toInput(profile) : BLANK), [profile]);
  const [draft, setDraft] = useState<ProfileInput>(initial);
  // Only auto-fill derived fields until the user takes them over.
  const [autoFill, setAutoFill] = useState(profile === null);
  // A saved profile may point at a self-hosted instance, which has no preset —
  // show the free-text field straight away rather than silently mis-selecting.
  const [customHost, setCustomHost] = useState(
    () => !isKnownHostName(initial.hostName),
  );

  useEffect(() => {
    const next = profile ? toInput(profile) : BLANK;
    setDraft(next);
    setAutoFill(profile === null);
    setCustomHost(!isKnownHostName(next.hostName));
  }, [profile]);

  const dirty = !sameAs(draft, initial);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setAlias(alias: string) {
    setDraft((current) => {
      if (!autoFill) return { ...current, alias };
      return { ...current, alias, ...derived(alias, current.hostName) };
    });
  }

  function setHostName(hostName: string) {
    setDraft((current) => {
      if (!autoFill) return { ...current, hostName };
      return { ...current, hostName, ...derived(current.alias, hostName) };
    });
  }

  function pickHost(value: string) {
    if (value === CUSTOM_HOST) {
      // Keep whatever is there so the field is a starting point, not a reset.
      setCustomHost(true);
      return;
    }
    setCustomHost(false);
    setHostName(value);
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

  async function addFolders() {
    const picked = await open({
      directory: true,
      multiple: true,
      title: "Use this identity in…",
    });
    // `multiple` returns an array, but normalise anyway — the plugin hands back
    // a bare string when the platform picker only yields one.
    const paths =
      typeof picked === "string" ? [picked] : Array.isArray(picked) ? picked : [];
    if (paths.length === 0) return;

    const existing = new Set(draft.dirs);
    const added: string[] = [];
    for (const path of paths) {
      // The picker can hand back the same folder twice across a batch, so
      // guard against the incoming list as well as what's already there.
      if (existing.has(path)) continue;
      existing.add(path);
      added.push(path);
    }

    if (added.length > 0) set("dirs", [...draft.dirs, ...added]);

    // Picking five folders and seeing three appear needs explaining.
    const skipped = paths.length - added.length;
    if (skipped > 0) {
      toast.message(`${plural(skipped, "folder")} already listed`, {
        description:
          added.length > 0
            ? `Added the other ${added.length}.`
            : "Nothing to add.",
      });
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <Card className="gap-0 py-0">
        <CardContent className="px-4 py-4">
          <FieldGroup className="gap-5">
            <FieldSet>
              <FieldLegend>Identity</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${ids}-alias`}>Alias</FieldLabel>
                  <Input
                    id={`${ids}-alias`}
                    className="font-mono"
                    value={draft.alias}
                    onChange={(event) => setAlias(event.target.value)}
                    placeholder="work"
                    {...LITERAL_INPUT}
                  />
                  <FieldDescription>
                    Short handle for this account. Also names
                    ~/.gitconfig-&lt;alias&gt;.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${ids}-name`}>Commit name</FieldLabel>
                  <Input
                    id={`${ids}-name`}
                    value={draft.name}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Jane Doe"
                  />
                  <FieldDescription>
                    Shows up as the commit author.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`${ids}-email`}>Commit email</FieldLabel>
                <Input
                  id={`${ids}-email`}
                  className="font-mono"
                  value={draft.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="jane@company.com"
                  {...LITERAL_INPUT}
                />
                <FieldDescription>
                  Must match an email registered with the host, or your commits
                  won't be linked to your account.
                </FieldDescription>
              </Field>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>SSH</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${ids}-host`}>Host</FieldLabel>
                  <Select
                    value={customHost ? CUSTOM_HOST : draft.hostName}
                    onValueChange={pickHost}
                  >
                    <SelectTrigger id={`${ids}-host`} className="w-full">
                      <SelectValue placeholder="Choose a host" />
                    </SelectTrigger>
                    <SelectContent>
                      {GIT_HOST_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.hostName}>
                          {/* One flex row, so the pairing keeps its gap in the
                              trigger and in the list alike. */}
                          <span className="flex items-center gap-1.5">
                            {provider.label}
                            <span className="text-muted-foreground font-mono">
                              {provider.hostName}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={CUSTOM_HOST}>
                        Self-hosted or other…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {customHost ? (
                    <Input
                      className="font-mono"
                      value={draft.hostName}
                      onChange={(event) => setHostName(event.target.value)}
                      placeholder="gitlab.mycompany.com"
                      aria-label="Host name"
                      {...LITERAL_INPUT}
                    />
                  ) : null}
                  <FieldDescription>
                    {customHost
                      ? "A self-hosted GitLab or Bitbucket still gets the right key-settings link; anything else falls back to GitHub's layout."
                      : "The server your repos live on."}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${ids}-host-alias`}>
                    Host alias
                  </FieldLabel>
                  <Input
                    id={`${ids}-host-alias`}
                    className="font-mono"
                    value={draft.hostAlias}
                    onChange={(event) => {
                      setAutoFill(false);
                      set("hostAlias", event.target.value);
                    }}
                    placeholder="github.com-work"
                    {...LITERAL_INPUT}
                  />
                  <FieldDescription>
                    Clone with git@&lt;alias&gt;:owner/repo.git to pin this key.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`${ids}-key`}>Private key</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${ids}-key`}
                    className="font-mono"
                    value={draft.sshKeyPath}
                    onChange={(event) => {
                      setAutoFill(false);
                      set("sshKeyPath", event.target.value);
                    }}
                    placeholder="~/.ssh/id_ed25519_work"
                    {...LITERAL_INPUT}
                  />
                  <Button type="button" variant="outline" onClick={pickKey}>
                    Browse…
                  </Button>
                </div>
                <FieldDescription>
                  The app only stores this path. It never reads your private
                  key.
                </FieldDescription>
              </Field>
            </FieldSet>

            <Separator />

            <FieldSet>
              {/* `legend` is only a legend as the first child of its fieldset,
                  so the row action sits beside the description instead. */}
              <FieldLegend>Use in these folders</FieldLegend>

              <div className="flex items-start justify-between gap-3">
                <FieldDescription>
                  Every repo under these folders commits as this identity, via
                  git's <code className="font-mono">includeIf</code>. A nested
                  folder assigned to another profile still wins over its parent.
                </FieldDescription>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={addFolders}
                >
                  <FolderPlus />
                  Add folders…
                </Button>
              </div>

              {draft.dirs.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-[0.6875rem]">
                  No folders yet — this profile will only apply when you clone
                  through its host alias.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {draft.dirs.map((dir) => (
                    <li
                      key={dir}
                      className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border py-1 pr-1 pl-2.5"
                    >
                      <span className="truncate font-mono text-[0.6875rem]">
                        {dir}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${dir}`}
                        className="hover:bg-destructive-muted hover:text-destructive text-muted-foreground"
                        onClick={() =>
                          set(
                            "dirs",
                            draft.dirs.filter((entry) => entry !== dir),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </FieldSet>
          </FieldGroup>
        </CardContent>

        <CardFooter className="bg-muted/40 mt-4 justify-between gap-2 border-t py-2.5">
          <div>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={busy}
                className="text-destructive hover:bg-destructive-muted hover:text-destructive"
              >
                {deleting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                {deleting ? "Deleting…" : "Delete profile"}
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="text-muted-foreground text-[0.6875rem]">
                Unsaved changes
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              {profile ? "Revert" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy || !dirty}>
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {saving
                ? "Saving…"
                : profile
                  ? "Save changes"
                  : "Create profile"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
