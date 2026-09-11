import { Download, LoaderCircle, Plus, Upload } from "lucide-react";

import type { KeyHealth, Profile, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Sidebar({
  profiles,
  health,
  status,
  selectedId,
  globalProfileId,
  creating,
  onSelect,
  onCreate,
  onExport,
  onImport,
  exporting,
  importing,
  busy,
}: {
  profiles: Profile[];
  health: KeyHealth[];
  status: Snapshot;
  selectedId: string | null;
  globalProfileId: string | null;
  creating: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onExport: () => void;
  onImport: () => void;
  exporting: boolean;
  importing: boolean;
  busy: boolean;
}) {
  const activeAlias =
    status.directory?.matchedAlias ?? status.global.matchedAlias;

  return (
    <aside className="bg-card flex w-60 shrink-0 flex-col border-r">
      <div className="flex h-9 items-center justify-between pr-1.5 pl-3">
        <span className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
          Profiles
          {profiles.length > 0 ? (
            <span className="text-muted-foreground/70 tabular-nums">
              {profiles.length}
            </span>
          ) : null}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCreate}
              aria-label="Add a profile"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add a profile</TooltipContent>
        </Tooltip>
      </div>

      <nav className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
        {profiles.length === 0 && !creating ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-[0.6875rem] leading-relaxed">
            No profiles yet. Add one for each account you commit from.
          </p>
        ) : null}

        <ul className="flex flex-col gap-0.5">
          {creating ? (
            <li className="border-primary/50 bg-primary/8 text-primary rounded-md border border-dashed px-2.5 py-2 text-xs font-medium">
              New profile…
            </li>
          ) : null}

          {profiles.map((profile) => {
            const keyHealth = health.find(
              (entry) => entry.profileId === profile.id,
            );
            const selected = !creating && profile.id === selectedId;
            const active = profile.alias === activeAlias;

            return (
              <li key={profile.id}>
                <button
                  onClick={() => onSelect(profile.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none",
                    "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {profile.alias}
                    </span>
                    {active ? <Badge variant="success">active</Badge> : null}
                    {profile.id === globalProfileId ? (
                      <Badge variant="accent">global</Badge>
                    ) : null}
                    {keyHealth && !keyHealth.privateKeyExists ? (
                      <Badge variant="warning">no key</Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground truncate font-mono text-[0.6875rem]">
                    {profile.email}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-1 border-t p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onExport}
          disabled={busy || profiles.length === 0}
        >
          {exporting ? <LoaderCircle className="animate-spin" /> : <Upload />}
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onImport}
          disabled={busy}
        >
          {importing ? <LoaderCircle className="animate-spin" /> : <Download />}
          Import
        </Button>
      </div>
    </aside>
  );
}
