import type { KeyHealth, Profile, Snapshot } from "../lib/types";
import { Badge, Button } from "./ui";

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
  busy: boolean;
}) {
  const activeAlias =
    status.directory?.matchedAlias ?? status.global.matchedAlias;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Profiles
        </span>
        <Button variant="ghost" onClick={onCreate} title="Add a profile">
          + New
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {profiles.length === 0 && !creating ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-ink-faint">
            No profiles yet. Add one for each account you commit from.
          </p>
        ) : null}

        <ul className="flex flex-col gap-0.5">
          {creating ? (
            <li className="rounded-md border border-dashed border-accent bg-accent-soft px-2.5 py-2 text-[12px] font-medium text-accent">
              New profile…
            </li>
          ) : null}

          {profiles.map((profile) => {
            const keyHealth = health.find((h) => h.profileId === profile.id);
            const selected = !creating && profile.id === selectedId;
            const active = profile.alias === activeAlias;

            return (
              <li key={profile.id}>
                <button
                  onClick={() => onSelect(profile.id)}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "bg-accent-soft text-ink"
                      : "text-ink-soft hover:bg-sunken"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                      {profile.alias}
                    </span>
                    {active ? <Badge tone="good">active</Badge> : null}
                    {profile.id === globalProfileId ? (
                      <Badge tone="accent">global</Badge>
                    ) : null}
                    {keyHealth && !keyHealth.privateKeyExists ? (
                      <Badge tone="warn">no key</Badge>
                    ) : null}
                  </span>
                  <span className="truncate font-mono text-[11px] text-ink-faint">
                    {profile.email}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <Button variant="ghost" onClick={onExport} disabled={busy || profiles.length === 0}>
          Export…
        </Button>
        <Button variant="ghost" onClick={onImport} disabled={busy}>
          Import…
        </Button>
      </div>
    </aside>
  );
}
