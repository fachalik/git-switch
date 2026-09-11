import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { plural } from "@/lib/format";
import type { Identity, Profile, Settings } from "@/lib/types";
import { GlobalIdentity } from "@/components/common/GlobalIdentity";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function AppHeader({
  identity,
  settings,
  profiles,
  pendingCount,
  onSetGlobal,
  onReview,
  busy,
}: {
  identity: Identity;
  settings: Settings;
  profiles: Profile[];
  pendingCount: number;
  onSetGlobal: (id: string | null) => void;
  onReview: () => void;
  busy: boolean;
}) {
  return (
    <header className="bg-card flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">
          Git Switcher
        </h1>
        <Separator orientation="vertical" className="!h-3.5" />
        <GlobalIdentity
          identity={identity}
          settings={settings}
          profiles={profiles}
          onSetGlobal={onSetGlobal}
          busy={busy}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {pendingCount > 0 ? (
          <span className="text-warning flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5" />
            {plural(pendingCount, "file")} out of date
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="size-3.5" />
            Config up to date
          </span>
        )}
        <Button
          variant={pendingCount > 0 ? "default" : "outline"}
          onClick={onReview}
          disabled={busy}
        >
          Review &amp; apply
        </Button>
      </div>
    </header>
  );
}
