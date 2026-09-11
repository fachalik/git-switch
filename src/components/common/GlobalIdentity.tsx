import { ChevronDown, Globe } from "lucide-react";

import type { Identity, Profile, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const STATE_VARIANT = {
  matched: "success",
  unregistered: "destructive",
  unset: "warning",
  missing: "warning",
} as const;

const STATE_LABEL = {
  matched: "Registered",
  unregistered: "Unregistered",
  unset: "Not set",
  missing: "Missing",
} as const;

const UNMANAGED = "__unmanaged__";

/**
 * The global identity is configuration you set once, not the live answer to
 * "who am I committing as?" — so it lives in the header as a compact control
 * and leaves the content area to the watched folder. It still shouts: a state
 * that isn't `matched` shows as a badge on the trigger rather than a quiet dot.
 */
export function GlobalIdentity({
  identity,
  settings,
  profiles,
  onSetGlobal,
  busy,
}: {
  identity: Identity;
  settings: Settings;
  profiles: Profile[];
  onSetGlobal: (id: string | null) => void;
  busy: boolean;
}) {
  const globalProfile =
    profiles.find((profile) => profile.id === settings.globalProfileId) ?? null;

  // Chosen in the app but not yet on disk — the setting is only intent until
  // the change is applied, like everything else here.
  const pending =
    globalProfile !== null &&
    globalProfile.email.toLowerCase() !==
      (identity.email ?? "").toLowerCase();

  const healthy = identity.state === "matched";
  const label = identity.matchedAlias ?? identity.email ?? "Not set";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-7 max-w-72 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors outline-none",
          "bg-card hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "data-[state=open]:bg-accent",
        )}
      >
        <Globe className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground shrink-0">Global</span>
        {/* Never let the badge squeeze the identity out of the trigger — the
            name is the thing the header exists to show. */}
        <span className="min-w-12 truncate font-medium">{label}</span>
        {healthy ? (
          <span className="bg-success size-1.5 shrink-0 rounded-full" />
        ) : (
          <Badge variant={STATE_VARIANT[identity.state]}>
            {STATE_LABEL[identity.state]}
          </Badge>
        )}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent className="w-80">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-wide uppercase">
              Global identity
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{label}</span>
              <Badge variant={STATE_VARIANT[identity.state]}>
                {STATE_LABEL[identity.state]}
              </Badge>
            </div>
            <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 text-[0.6875rem]">
              {identity.matchedAlias && identity.email ? (
                <div className="truncate font-mono">{identity.email}</div>
              ) : null}
              {identity.name ? (
                <div className="truncate">{identity.name}</div>
              ) : null}
              {identity.origin ? (
                <div className="truncate opacity-80">
                  from {identity.origin}
                </div>
              ) : null}
            </div>
          </div>

          {identity.state === "unregistered" ? (
            <p className="text-destructive text-[0.6875rem] leading-snug">
              This email doesn't match any profile here. Commits outside your
              assigned folders would be attributed to an identity the app
              doesn't manage.
            </p>
          ) : null}
          {identity.state === "unset" ? (
            <p className="text-warning text-[0.6875rem] leading-snug">
              No <code className="font-mono">user.email</code> is set globally.
              Git will refuse to commit outside your assigned folders.
            </p>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-medium">Use profile</span>
              {pending ? <Badge variant="warning">apply to switch</Badge> : null}
            </div>
            <Select
              value={settings.globalProfileId ?? UNMANAGED}
              disabled={busy}
              onValueChange={(value) =>
                onSetGlobal(value === UNMANAGED ? null : value)
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNMANAGED}>Leave unmanaged</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-[0.6875rem] leading-snug">
              The fallback identity for every repo outside a folder you've
              assigned to a profile.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
