import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Overview } from "@/lib/types";
import type { CommandKey, RunCommand } from "@/hooks/useOverview";

/**
 * Everything that touches the user's real config: the apply step itself, and
 * the two settings that decide what gets written.
 */
export function useConfigActions({
  setOverview,
  refresh,
  run,
  pending,
}: {
  setOverview: (overview: Overview) => void;
  refresh: () => Promise<void>;
  run: RunCommand;
  pending: CommandKey | null;
}) {
  const [reviewing, setReviewing] = useState(false);

  async function apply() {
    const report = await run("apply", () => api.applyConfig());
    if (!report) return;
    setReviewing(false);
    await refresh();

    const parts = [
      report.written.length
        ? `${plural(report.written.length, "file")} written`
        : null,
      report.removed.length ? `${report.removed.length} removed` : null,
      report.backups.length
        ? `${report.backups.length} backed up to .bak`
        : null,
    ].filter(Boolean);
    toast.success(parts.length ? "Changes applied" : "Nothing to change", {
      description: parts.length ? parts.join(", ") : undefined,
    });
  }

  async function watchDir(dir: string | null) {
    const next = await run("watch-dir", () => api.setWatchedDir(dir));
    if (next) setOverview(next);
  }

  async function setGlobalProfile(id: string | null) {
    const next = await run("set-global", () => api.setGlobalProfile(id));
    if (!next) return;
    setOverview(next);

    const alias = next.profiles.find((profile) => profile.id === id)?.alias;
    toast.message(
      alias
        ? `"${alias}" will become your global identity`
        : "Global identity left unmanaged",
      {
        description: alias
          ? "Apply to write it."
          : "Apply to remove it from ~/.gitconfig.",
      },
    );
  }

  return {
    reviewing,
    setReviewing,
    apply,
    watchDir,
    setGlobalProfile,
    applying: pending === "apply",
    switchingDir: pending === "watch-dir",
  };
}
