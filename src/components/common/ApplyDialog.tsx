import { useMemo, useState } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { countChanges, diffLines, toHunks } from "@/lib/diff";
import { plural } from "@/lib/format";
import type { DiffLine, DiffOp } from "@/lib/diff";
import type { FileChange, Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OP_CLASS: Record<DiffOp, string> = {
  add: "bg-success-muted text-success",
  remove: "bg-destructive-muted text-destructive",
  keep: "text-muted-foreground",
};

const OP_SIGN: Record<DiffOp, string> = { add: "+", remove: "−", keep: " " };

/** `lines` is `null` when the file is past the diffable size. */
function DiffView({ lines, path }: { lines: DiffLine[] | null; path: string }) {
  if (lines === null) {
    return (
      <p className="text-muted-foreground p-3 text-[0.6875rem] leading-snug">
        This file is too large to diff here. It will be rewritten with your
        managed block updated; the previous contents are kept as{" "}
        <code className="font-mono">{path}.bak</code>.
      </p>
    );
  }

  const hunks = toHunks(lines);
  if (hunks.length === 0) {
    return (
      <p className="text-muted-foreground p-3 text-[0.6875rem]">No changes.</p>
    );
  }

  return (
    <div className="overflow-x-auto font-mono text-[0.6875rem] leading-relaxed">
      {hunks.map((hunk, index) => (
        <div key={index}>
          {hunk.skippedBefore > 0 ? (
            <div className="bg-muted text-muted-foreground px-3 py-0.5 select-none">
              ⋯ {plural(hunk.skippedBefore, "unchanged line")}
            </div>
          ) : null}
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={cn("px-3 whitespace-pre", OP_CLASS[line.op])}
            >
              <span className="inline-block w-3 select-none">
                {OP_SIGN[line.op]}
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
  // One diff per file: the counts in the header and the body below are two
  // readings of the same result, not two passes over the file.
  const lines = useMemo(
    () => diffLines(change.before, change.after),
    [change.before, change.after],
  );
  const stats = useMemo(() => (lines ? countChanges(lines) : null), [lines]);

  return (
    <li>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="overflow-hidden rounded-md border"
      >
        <CollapsibleTrigger className="bg-card hover:bg-accent/60 flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors outline-none">
          <ChevronRight
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs">
              {change.path}
            </span>
            <span className="text-muted-foreground block truncate text-[0.6875rem]">
              {change.label}
            </span>
          </span>
          {change.orphan ? (
            <Badge variant="destructive">will be deleted</Badge>
          ) : !change.exists ? (
            <Badge variant="accent">new file</Badge>
          ) : null}
          {stats ? (
            <span className="shrink-0 font-mono text-[0.6875rem]">
              <span className="text-success">+{stats.added}</span>{" "}
              <span className="text-destructive">−{stats.removed}</span>
            </span>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent className="bg-background border-t py-1">
          <DiffView lines={lines} path={change.path} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function ApplyDialog({
  open,
  onOpenChange,
  plan,
  onApply,
  applying,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan;
  onApply: () => void;
  applying: boolean;
  busy: boolean;
}) {
  const changed = plan.changes.filter((change) => change.changed);
  const willDelete = changed.some((change) => change.orphan);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review changes</DialogTitle>
          <DialogDescription>
            Exactly what will be written. Every file is copied to a .bak next to
            it first.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {changed.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">
              Your config files already match your profiles. Nothing to write.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {willDelete ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    One or more generated include files are left over from
                    profiles you deleted. Applying removes them (a .bak copy is
                    kept).
                  </AlertDescription>
                </Alert>
              ) : null}

              {plan.notes.map((note, index) => (
                <Alert
                  key={index}
                  variant={note.level === "warn" ? "warning" : "default"}
                >
                  <AlertDescription>{note.message}</AlertDescription>
                </Alert>
              ))}

              <ul className="flex flex-col gap-2">
                {changed.map((change) => (
                  <ChangeRow key={change.path} change={change} />
                ))}
              </ul>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={onApply} disabled={busy || changed.length === 0}>
            {applying ? <LoaderCircle className="animate-spin" /> : null}
            {applying
              ? "Applying…"
              : `Apply ${plural(changed.length, "file change")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
