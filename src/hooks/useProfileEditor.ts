import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Overview, Profile, ProfileInput } from "@/lib/types";
import type { CommandKey, RunCommand } from "@/hooks/useOverview";

/**
 * Which profile the workspace is editing, plus the two commands that change
 * the list. `creating` is a mode rather than a null selection, so cancelling a
 * new profile drops back to whichever one was open before.
 */
export function useProfileEditor({
  profiles,
  setOverview,
  run,
  pending,
}: {
  profiles: Profile[];
  setOverview: (overview: Overview) => void;
  run: RunCommand;
  pending: CommandKey | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Bumped to remount the form, which is how "Revert" throws away its draft.
  const [nonce, setNonce] = useState(0);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  // Keep a selection pointed at something real as profiles come and go.
  useEffect(() => {
    if (creating) return;
    if (profiles.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId, creating]);

  const select = useCallback((id: string) => {
    setCreating(false);
    setSelectedId(id);
  }, []);

  const cancel = useCallback(() => {
    if (creating) setCreating(false);
    else setNonce((current) => current + 1);
  }, [creating]);

  async function save(input: ProfileInput) {
    const next = await run("save-profile", () =>
      creating || !selected
        ? api.createProfile(input)
        : api.updateProfile(selected.id, input),
    );
    if (!next) return;
    setOverview(next);

    if (!creating) {
      toast.success("Profile saved", {
        description: "Apply to write the changes to disk.",
      });
      return;
    }

    const created = next.profiles.find(
      (profile) => profile.alias === input.alias.trim(),
    );
    setCreating(false);
    if (created) setSelectedId(created.id);
    toast.success(`Profile "${input.alias}" created`, {
      description: "Apply to write it to disk.",
    });
  }

  async function remove() {
    if (!selected) return;
    const confirmed = await confirm(
      `Delete the profile "${selected.alias}"?\n\nIts SSH key stays on disk. The generated config for it is removed the next time you apply.`,
      { title: "Delete profile", kind: "warning", okLabel: "Delete" },
    );
    if (!confirmed) return;

    const next = await run("delete-profile", () =>
      api.deleteProfile(selected.id),
    );
    if (!next) return;
    setOverview(next);
    toast.success(`Deleted "${selected.alias}"`, {
      description: "Apply to clean up its config files.",
    });
  }

  return {
    selectedId,
    creating,
    /** What the form is bound to — `null` while a new profile is being made. */
    editing: creating ? null : selected,
    /** Changing this remounts the form, discarding the draft in it. */
    formKey: `${creating ? "new" : selectedId}:${nonce}`,
    saving: pending === "save-profile",
    deleting: pending === "delete-profile",
    select,
    startCreate: () => setCreating(true),
    cancel,
    save,
    remove,
  };
}
