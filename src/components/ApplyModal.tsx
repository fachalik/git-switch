import { useMemo, useState } from "react";
import { countChanges, diffLines, toHunks } from "../lib/diff";
import type { FileChange, Plan } from "../lib/types";
import { Badge, Button, Modal } from "./ui";

function DiffView({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => diffLines(change.before, change.after),
    [change.before, change.after],
  );

  if (lines === null) {
    return (
      <p className="p-3 text-[11px] text-ink-faint">
        This file is too large to diff here. It will be rewritten with your
        managed block updated; the previous contents are kept as{" "}
        <code className="font-mono">{change.path}.bak</code>.
      </p>
    );
  }

  const hunks = toHunks(lines);
  if (hunks.length === 0) {
    return <p className="p-3 text-[11px] text-ink-faint">No changes.</p>;
  }

  return (
    <div className="overflow-x-auto font-mono text-[11px] leading-relaxed">
      {hunks.map((hunk, index) => (
        <div key={index}>
          {hunk.skippedBefore > 0 ? (
            <div className="bg-sunken px-3 py-0.5 text-ink-faint select-none">
              ⋯ {hunk.skippedBefore} unchanged line
              {hunk.skippedBefore === 1 ? "" : "s"}
            </div>
          ) : null}
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={`px-3 whitespace-pre ${
                line.op === "add"
                  ? "bg-good-soft text-good"
                  : line.op === "remove"
                    ? "bg-bad-soft text-bad"
                    : "text-ink-soft"
              }`}
            >
              <span className="inline-block w-3 select-none">
                {line.op === "add" ? "+" : line.op === "remove" ? "−" : " "}
              </span>
              {line.text || " "}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ChangeRow({ change }: { change: FileChange }) {
  const [open, setOpen] = useState(true);
  const stats = useMemo(() => {
    const lines = diffLines(change.before, change.after);
    return lines ? countChanges(lines) : null;
  }, [change.before, change.after]);

  return (
    <li className="overflow-hidden rounded-lg border border-line">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 bg-surface px-3 py-2 text-left hover:bg-sunken"
      >
        <span className="w-3 shrink-0 text-[10px] text-ink-faint">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] text-ink">
            {change.path}
          </span>
          <span className="block truncate text-[11px] text-ink-faint">
            {change.label}
          </span>
        </span>
        {change.orphan ? (
          <Badge tone="bad">will be deleted</Badge>
        ) : !change.exists ? (
          <Badge tone="accent">new file</Badge>
        ) : null}
        {stats ? (
          <span className="shrink-0 font-mono text-[11px]">
            <span className="text-good">+{stats.added}</span>{" "}
            <span className="text-bad">−{stats.removed}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-line bg-canvas py-1">
          <DiffView change={change} />
        </div>
      ) : null}
    </li>
  );
}

export function ApplyModal({
  plan,
  onApply,
  onClose,
  busy,
}: {
  plan: Plan;
  onApply: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const changed = plan.changes.filter((change) => change.changed);
  const willDelete = changed.some((change) => change.orphan);

  return (
    <Modal
      wide
      title="Review changes"
      subtitle="Exactly what will be written. Every file is copied to a .bak next to it first."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onApply}
            disabled={busy || changed.length === 0}
          >
            {busy ? "Applying…" : `Apply ${changed.length} file change${changed.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {changed.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-ink-soft">
          Your config files already match your profiles. Nothing to write.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {willDelete ? (
            <p className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-[11px] text-bad">
              One or more generated include files are left over from profiles
              you deleted. Applying removes them (a .bak copy is kept).
            </p>
          ) : null}
          {plan.notes.map((note, index) => (
            <p
              key={index}
              className={`rounded-md border px-3 py-2 text-[11px] leading-snug ${
                note.level === "warn"
                  ? "border-warn/40 bg-warn-soft text-warn"
                  : "border-line bg-sunken text-ink-soft"
              }`}
            >
              {note.message}
            </p>
          ))}

          <ul className="flex flex-col gap-2">
            {changed.map((change) => (
              <ChangeRow key={change.path} change={change} />
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
