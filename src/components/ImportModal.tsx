import { useState } from "react";
import type { ImportPreview } from "../lib/types";
import { Badge, Button, Modal } from "./ui";

const STATUS_TONE = {
  new: "good",
  conflict: "warn",
  identical: "neutral",
  invalid: "bad",
} as const;

const STATUS_LABEL = {
  new: "new",
  conflict: "already exists",
  identical: "unchanged",
  invalid: "invalid",
} as const;

export function ImportModal({
  preview,
  onImport,
  onClose,
  busy,
}: {
  preview: ImportPreview;
  onImport: (overwrite: boolean) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [overwrite, setOverwrite] = useState(false);
  const importable = preview.entries.filter(
    (entry) => entry.status === "new" || entry.status === "conflict",
  ).length;

  return (
    <Modal
      wide
      title="Import profiles"
      subtitle={`${preview.path} — exported ${new Date(preview.exportedAt).toLocaleString()}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onImport(overwrite)}
            disabled={busy || importable === 0}
          >
            {busy ? "Importing…" : "Import"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-ink-soft">
          Importing only adds profile metadata. No keys are created and no
          config files are written until you apply.
        </p>

        {preview.conflictCount > 0 ? (
          <label className="flex items-start gap-2 rounded-md border border-line bg-sunken px-3 py-2">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[12px] text-ink">
              Replace the {preview.conflictCount} profile
              {preview.conflictCount === 1 ? "" : "s"} that already exist
              <span className="block text-[11px] text-ink-faint">
                Leave this off and existing profiles are kept as they are.
              </span>
            </span>
          </label>
        ) : null}

        <ul className="flex flex-col gap-1">
          {preview.entries.map((entry) => (
            <li
              key={entry.alias}
              className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-ink">
                  {entry.alias}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-faint">
                  {entry.email} · {entry.hostAlias}
                </span>
                {entry.detail ? (
                  <span className="block truncate text-[11px] text-ink-faint">
                    {entry.detail}
                  </span>
                ) : null}
              </span>
              <Badge tone={STATUS_TONE[entry.status]}>
                {entry.status === "conflict" && !overwrite
                  ? "will be skipped"
                  : STATUS_LABEL[entry.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
