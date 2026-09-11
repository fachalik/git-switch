import { useEffect, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { plural } from "@/lib/format";
import type { ImportPreview } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const STATUS_VARIANT = {
  new: "success",
  conflict: "warning",
  identical: "secondary",
  invalid: "destructive",
} as const;

const STATUS_LABEL = {
  new: "new",
  conflict: "already exists",
  identical: "unchanged",
  invalid: "invalid",
} as const;

export function ImportDialog({
  preview,
  onOpenChange,
  onImport,
  importing,
  busy,
}: {
  /** `null` keeps the dialog closed. */
  preview: ImportPreview | null;
  onOpenChange: (open: boolean) => void;
  onImport: (overwrite: boolean) => void;
  importing: boolean;
  busy: boolean;
}) {
  const overwriteId = useId();
  const [overwrite, setOverwrite] = useState(false);

  // Each file gets its own decision; don't carry the last one over.
  useEffect(() => {
    setOverwrite(false);
  }, [preview?.path]);

  if (!preview) return null;

  const importable = preview.entries.filter(
    (entry) => entry.status === "new" || entry.status === "conflict",
  ).length;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import profiles</DialogTitle>
          <DialogDescription className="truncate font-mono">
            {preview.path}
          </DialogDescription>
          <DialogDescription>
            Exported {new Date(preview.exportedAt).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs leading-snug">
            Importing only adds profile metadata. No keys are created and no
            config files are written until you apply.
          </p>

          {preview.conflictCount > 0 ? (
            <Label
              htmlFor={overwriteId}
              className="bg-muted/40 flex items-start gap-2.5 rounded-md border px-3 py-2.5 font-normal"
            >
              <Checkbox
                id={overwriteId}
                checked={overwrite}
                onCheckedChange={(checked) => setOverwrite(checked === true)}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">
                  Replace the {plural(preview.conflictCount, "profile")} that
                  already exist
                </span>
                <span className="text-muted-foreground text-[0.6875rem]">
                  Leave this off and existing profiles are kept as they are.
                </span>
              </span>
            </Label>
          ) : null}

          <ul className="flex flex-col gap-1">
            {preview.entries.map((entry) => (
              <li
                key={entry.alias}
                className="bg-card flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {entry.alias}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-[0.6875rem]">
                    {entry.email} · {entry.hostAlias}
                  </span>
                  {entry.detail ? (
                    <span className="text-muted-foreground block truncate text-[0.6875rem]">
                      {entry.detail}
                    </span>
                  ) : null}
                </span>
                <Badge variant={STATUS_VARIANT[entry.status]}>
                  {entry.status === "conflict" && !overwrite
                    ? "will be skipped"
                    : STATUS_LABEL[entry.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onImport(overwrite)}
            disabled={busy || importable === 0}
          >
            {importing ? <LoaderCircle className="animate-spin" /> : null}
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
