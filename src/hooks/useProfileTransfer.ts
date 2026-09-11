import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { ImportPreview } from "@/lib/types";
import type { CommandKey, RunCommand } from "@/hooks/useOverview";

/**
 * Moving profiles in and out of a JSON file. Importing is two steps on
 * purpose: the preview is what makes "this would overwrite three of yours" a
 * decision rather than a surprise.
 */
export function useProfileTransfer({
  count,
  run,
  refresh,
  pending,
}: {
  count: number;
  run: RunCommand;
  refresh: () => Promise<void>;
  pending: CommandKey | null;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  async function exportProfiles() {
    const path = await save({
      title: "Export profiles",
      defaultPath: "gitswitcher-profiles.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;

    const written = await run("export", () => api.exportProfiles(path));
    if (written) {
      toast.success(`Exported ${plural(count, "profile")}`, {
        description: written,
      });
    }
  }

  async function startImport() {
    const path = await open({
      title: "Import profiles",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;

    const next = await run("import-preview", () => api.previewImport(path));
    if (next) setPreview(next);
  }

  async function runImport(overwrite: boolean) {
    if (!preview) return;
    const report = await run("import", () =>
      api.importProfiles(preview.path, overwrite),
    );
    if (!report) return;

    setPreview(null);
    await refresh();
    toast.success("Profiles imported", {
      description: `${report.added.length} added, ${report.replaced.length} replaced, ${report.skipped.length} skipped.`,
    });
  }

  return {
    preview,
    exporting: pending === "export",
    // The picker blocks before this starts, so it covers the preview read only.
    opening: pending === "import-preview",
    importing: pending === "import",
    close: () => setPreview(null),
    exportProfiles,
    startImport,
    runImport,
  };
}
