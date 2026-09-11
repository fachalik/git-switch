import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderSearch, RefreshCw, X } from "lucide-react";

import type { Identity, Settings, Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  missing: "Folder missing",
} as const;

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-[0.625rem] tracking-wide uppercase">
        {label}
      </dt>
      <dd className={cn("truncate text-[0.6875rem]", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

/** Everything the app knows about the identity a commit in this folder gets. */
function FolderIdentity({ identity }: { identity: Identity }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="@container">
        <div className="grid gap-3 @md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-base font-semibold">
                {identity.matchedAlias ?? identity.email ?? "—"}
              </span>
              <Badge variant={STATE_VARIANT[identity.state]}>
                {STATE_LABEL[identity.state]}
              </Badge>
              {identity.dirExists ? (
                <Badge variant={identity.isGitRepo ? "secondary" : "warning"}>
                  {identity.isGitRepo ? "git repo" : "not a repo"}
                </Badge>
              ) : null}
            </div>
            <dl className="flex flex-col gap-1.5">
              {identity.matchedAlias && identity.email ? (
                <Detail label="Commits as" value={identity.email} mono />
              ) : null}
              {identity.name ? (
                <Detail label="Name" value={identity.name} />
              ) : null}
            </dl>
          </div>

          <dl className="flex min-w-0 flex-col gap-1.5">
            {identity.dir ? (
              <Detail label="Folder" value={identity.dir} mono />
            ) : null}
            {identity.origin ? (
              <Detail label="Decided by" value={identity.origin} mono />
            ) : null}
            {identity.remoteUrl ? (
              <Detail label="Remote" value={identity.remoteUrl} mono />
            ) : null}
          </dl>
        </div>
      </div>

      {identity.state === "unregistered" ? (
        <p className="text-destructive text-[0.6875rem] leading-snug">
          This email doesn't match any profile here. A commit made now would be
          attributed to an identity the app doesn't manage.
        </p>
      ) : null}
      {identity.state === "unset" ? (
        <p className="text-warning text-[0.6875rem] leading-snug">
          No <code className="font-mono">user.email</code> resolves here. Git
          will refuse to commit until one is set.
        </p>
      ) : null}

      {/* A folder that isn't a repo yet reports the global identity, which
          says nothing about what a repo created here would use. */}
      {identity.dirExists && !identity.isGitRepo && identity.folderRuleAlias ? (
        <p className="text-muted-foreground text-[0.6875rem] leading-snug">
          Not a repository, so git reports your global identity. A repo created
          here would commit as{" "}
          <strong className="text-foreground font-semibold">
            {identity.folderRuleAlias}
          </strong>
          .
        </p>
      ) : null}

      {/* The rule says one thing, git resolves another — usually a repo-local
          override, or config that hasn't been applied yet. */}
      {identity.isGitRepo &&
      identity.folderRuleAlias &&
      identity.matchedAlias !== identity.folderRuleAlias ? (
        <p className="text-warning text-[0.6875rem] leading-snug">
          This folder is assigned to{" "}
          <strong className="font-semibold">{identity.folderRuleAlias}</strong>,
          but git is resolving a different identity. Check for a repo-local
          override, or apply your pending changes.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The live answer to "who am I committing as?". This is the panel the menu bar
 * label is computed from, and the only place the app asks git the real
 * question — `git -C <dir> config`, which accounts for `includeIf`, repo-local
 * overrides and the rest of the precedence chain.
 */
export function WatchedFolder({
  status,
  settings,
  onWatchDir,
  onRefresh,
  refreshing,
  busy,
}: {
  status: Snapshot;
  settings: Settings;
  onWatchDir: (dir: string | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  busy: boolean;
}) {
  async function pickFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Watch a folder",
      defaultPath: settings.watchedDir ?? undefined,
    });
    if (typeof picked === "string") onWatchDir(picked);
  }

  const recentDirs = settings.recentDirs
    .filter((dir) => dir !== settings.watchedDir)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
          <FolderOpen className="size-3.5" />
          Watched folder
        </CardTitle>

        <CardAction className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                disabled={busy || refreshing}
                aria-label="Refresh"
              >
                <RefreshCw className={cn(refreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ask git again</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={pickFolder}
            disabled={busy}
          >
            {status.directory ? "Change" : "Choose folder"}
          </Button>
          {status.directory ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onWatchDir(null)}
                  aria-label="Stop watching"
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Stop watching</TooltipContent>
            </Tooltip>
          ) : null}
        </CardAction>
      </CardHeader>

      <CardContent>
        {status.directory ? (
          <FolderIdentity identity={status.directory} />
        ) : (
          <div className="flex flex-col items-start gap-2.5 rounded-md border border-dashed px-3 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">No folder watched</span>
              <p className="text-muted-foreground max-w-md text-[0.6875rem] leading-snug">
                Pick the folder you're working in and the menu bar tracks it —
                the identity git would actually use there, which file decided
                it, and whether that matches the profile you assigned. With none
                picked, the menu bar falls back to your global identity.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={pickFolder}>
              <FolderSearch />
              Choose folder
            </Button>
          </div>
        )}

        {recentDirs.length > 0 ? (
          <div className="mt-3 flex min-w-0 items-center gap-1.5 overflow-x-auto border-t pt-2.5">
            <span className="text-muted-foreground shrink-0 text-[0.6875rem]">
              Recent
            </span>
            {recentDirs.map((dir) => (
              <button
                key={dir}
                onClick={() => onWatchDir(dir)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground hover:border-input shrink-0 rounded-md border px-2 py-0.5 font-mono text-[0.6875rem] transition-colors disabled:opacity-50"
              >
                {dir}
              </button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
