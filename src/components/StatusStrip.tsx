import { open } from "@tauri-apps/plugin-dialog";
import type { Identity, Settings, Snapshot } from "../lib/types";
import { Badge, Button } from "./ui";

const STATE_TONE = {
  matched: "good",
  unregistered: "bad",
  unset: "warn",
  missing: "warn",
} as const;

const STATE_LABEL = {
  matched: "Registered",
  unregistered: "Unregistered",
  unset: "Not set",
  missing: "Folder missing",
} as const;

/**
 * The answer to "who am I committing as?", which is the thing this app exists
 * to make visible without opening a terminal.
 */
function IdentityCard({
  identity,
  title,
  caption,
  action,
}: {
  identity: Identity | null;
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
          {title}
        </span>
        {action}
      </div>

      {identity === null ? (
        <p className="text-[12px] text-ink-soft">{caption}</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">
              {identity.matchedAlias ?? identity.email ?? "—"}
            </span>
            <Badge tone={STATE_TONE[identity.state]}>
              {STATE_LABEL[identity.state]}
            </Badge>
            {identity.scope === "directory" && identity.dirExists ? (
              <Badge tone={identity.isGitRepo ? "neutral" : "warn"}>
                {identity.isGitRepo ? "git repo" : "not a repo"}
              </Badge>
            ) : null}
          </div>

          <dl className="flex flex-col gap-0.5 text-[11px] text-ink-soft">
            {identity.matchedAlias && identity.email ? (
              <div className="truncate font-mono">{identity.email}</div>
            ) : null}
            {identity.name ? (
              <div className="truncate">{identity.name}</div>
            ) : null}
            {identity.dir ? (
              <div className="truncate font-mono text-ink-faint">
                {identity.dir}
              </div>
            ) : null}
            {identity.origin ? (
              <div className="truncate text-ink-faint">
                from {identity.origin}
              </div>
            ) : null}
            {identity.remoteUrl ? (
              <div className="truncate font-mono text-ink-faint">
                {identity.remoteUrl}
              </div>
            ) : null}
          </dl>

          {identity.state === "unregistered" ? (
            <p className="text-[11px] leading-snug text-bad">
              This email doesn't match any profile here. A commit made now would
              be attributed to an identity the app doesn't manage.
            </p>
          ) : null}
          {identity.state === "unset" ? (
            <p className="text-[11px] leading-snug text-warn">
              No <code className="font-mono">user.email</code> resolves here.
              Git will refuse to commit until one is set.
            </p>
          ) : null}

          {/* A folder that isn't a repo yet reports the global identity, which
              says nothing about what a repo created here would use. */}
          {identity.scope === "directory" &&
          identity.dirExists &&
          !identity.isGitRepo &&
          identity.folderRuleAlias ? (
            <p className="text-[11px] leading-snug text-ink-soft">
              Not a repository, so git reports your global identity. A repo
              created here would commit as{" "}
              <strong className="font-semibold text-ink">
                {identity.folderRuleAlias}
              </strong>
              .
            </p>
          ) : null}

          {/* The rule says one thing, git resolves another — usually a
              repo-local override, or config that hasn't been applied yet. */}
          {identity.isGitRepo &&
          identity.folderRuleAlias &&
          identity.matchedAlias !== identity.folderRuleAlias ? (
            <p className="text-[11px] leading-snug text-warn">
              This folder is assigned to{" "}
              <strong className="font-semibold">
                {identity.folderRuleAlias}
              </strong>
              , but git is resolving a different identity. Check for a
              repo-local override, or apply your pending changes.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function StatusStrip({
  status,
  settings,
  onWatchDir,
  onRefresh,
  busy,
}: {
  status: Snapshot;
  settings: Settings;
  onWatchDir: (dir: string | null) => void;
  onRefresh: () => void;
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

  return (
    <section className="flex flex-col gap-3 border-b border-line bg-canvas px-4 py-3">
      <div className="flex items-start gap-3">
        <IdentityCard
          identity={status.global}
          title="Global identity"
          action={
            <Button variant="ghost" onClick={onRefresh} disabled={busy}>
              Refresh
            </Button>
          }
        />
        <IdentityCard
          identity={status.directory}
          title="Watched folder"
          caption="Pick the folder you're working in to see the identity git would actually use there."
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={pickFolder}>
                {status.directory ? "Change" : "Choose folder"}
              </Button>
              {status.directory ? (
                <Button variant="ghost" onClick={() => onWatchDir(null)}>
                  Clear
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      {settings.recentDirs.length > 1 ? (
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-[11px] text-ink-faint">Recent:</span>
          {settings.recentDirs
            .filter((dir) => dir !== settings.watchedDir)
            .slice(0, 5)
            .map((dir) => (
              <button
                key={dir}
                onClick={() => onWatchDir(dir)}
                className="shrink-0 rounded border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft hover:border-line-strong hover:text-ink"
              >
                {dir}
              </button>
            ))}
        </div>
      ) : null}
    </section>
  );
}
