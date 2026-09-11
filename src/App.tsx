import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { api, asAppError } from "./lib/api";
import type {
  GeneratedKey,
  ImportPreview,
  Overview,
  ProfileInput,
  Snapshot,
  SshTest,
} from "./lib/types";
import { ApplyModal } from "./components/ApplyModal";
import { ImportModal } from "./components/ImportModal";
import { KeyPanel } from "./components/KeyPanel";
import { ProfileForm } from "./components/ProfileForm";
import { Sidebar } from "./components/Sidebar";
import { StatusStrip } from "./components/StatusStrip";
import { Button, EmptyState, Toasts, type ToastMessage } from "./components/ui";

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Bumped to remount the form, which is how "Revert" throws away its draft.
  const [formNonce, setFormNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  const [showApply, setShowApply] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [sshTest, setSshTest] = useState<SshTest | null>(null);
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);

  const notify = useCallback(
    (text: string, tone: ToastMessage["tone"] = "neutral") => {
      const id = ++toastId.current;
      setToasts((current) => [...current, { id, tone, text }]);
      window.setTimeout(
        () => setToasts((current) => current.filter((t) => t.id !== id)),
        tone === "bad" ? 8000 : 4000,
      );
    },
    [],
  );

  const dismissToast = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  );

  /** Wrap a command so every failure surfaces as a toast, never a silent no-op. */
  const guard = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      try {
        return await run();
      } catch (error) {
        notify(asAppError(error).message, "bad");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.getOverview());
      setLoadError(null);
    } catch (error) {
      setLoadError(asAppError(error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The tray polls in the background; when it sees a change, pull the rest of
  // the state so the window agrees with the menu bar.
  useEffect(() => {
    const unlisten = listen<Snapshot>("status-changed", (event) => {
      setOverview((current) =>
        current ? { ...current, status: event.payload } : current,
      );
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  const profiles = overview?.profiles ?? [];
  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  // Keep a selection pointed at something real as profiles come and go.
  useEffect(() => {
    if (creating) return;
    if (profiles.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId, creating]);

  useEffect(() => {
    setSshTest(null);
    setGenerated(null);
  }, [selectedId, creating]);

  const pendingCount = overview?.plan.changes.filter((c) => c.changed).length ?? 0;

  async function saveProfile(input: ProfileInput) {
    const next = await guard(() =>
      creating || !selected
        ? api.createProfile(input)
        : api.updateProfile(selected.id, input),
    );
    if (!next) return;

    setOverview(next);
    if (creating) {
      const created = next.profiles.find(
        (profile) => profile.alias === input.alias.trim(),
      );
      setCreating(false);
      if (created) setSelectedId(created.id);
      notify(`Profile "${input.alias}" created. Apply to write it to disk.`);
    } else {
      notify("Profile saved. Apply to write the changes to disk.");
    }
  }

  async function deleteProfile() {
    if (!selected) return;
    const confirmed = await confirm(
      `Delete the profile "${selected.alias}"?\n\nIts SSH key stays on disk. The generated config for it is removed the next time you apply.`,
      { title: "Delete profile", kind: "warning", okLabel: "Delete" },
    );
    if (!confirmed) return;

    const next = await guard(() => api.deleteProfile(selected.id));
    if (!next) return;
    setOverview(next);
    notify(`Deleted "${selected.alias}". Apply to clean up its config files.`);
  }

  async function applyChanges() {
    const report = await guard(() => api.applyConfig());
    if (!report) return;
    setShowApply(false);
    await refresh();

    const written = report.written.length;
    const removed = report.removed.length;
    const parts = [
      written ? `${written} file${written === 1 ? "" : "s"} written` : null,
      removed ? `${removed} removed` : null,
      report.backups.length ? `${report.backups.length} backed up to .bak` : null,
    ].filter(Boolean);
    notify(parts.length ? parts.join(", ") : "Nothing to change", "good");
  }

  async function generateKey(overwrite: boolean) {
    if (!selected) return;
    if (overwrite) {
      const confirmed = await confirm(
        `Replace the existing key at ${selected.sshKeyPath}?\n\nThe old key is copied to a .bak file, but anything that trusts it — hosts, servers, signed commits — stops working until you register the new one.`,
        { title: "Regenerate SSH key", kind: "warning", okLabel: "Replace key" },
      );
      if (!confirmed) return;
    }

    const key = await guard(() => api.generateKey(selected.id, overwrite));
    if (!key) return;
    setGenerated(key);
    setSshTest(null);
    await refresh();
    notify(`Key created at ${key.privateKeyPath}. Register the public key next.`, "good");
  }

  async function testConnection() {
    if (!selected) return;
    const result = await guard(() => api.testSsh(selected.id));
    if (result) setSshTest(result);
  }

  async function watchDir(dir: string | null) {
    const next = await guard(() => api.setWatchedDir(dir));
    if (next) setOverview(next);
  }

  async function setGlobalProfile(id: string | null) {
    const next = await guard(() => api.setGlobalProfile(id));
    if (!next) return;
    setOverview(next);

    const alias = next.profiles.find((profile) => profile.id === id)?.alias;
    notify(
      alias
        ? `"${alias}" will become your global identity — apply to write it.`
        : "Global identity left unmanaged — apply to remove it from ~/.gitconfig.",
    );
  }

  async function exportProfiles() {
    const path = await save({
      title: "Export profiles",
      defaultPath: "gitswitcher-profiles.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;

    const written = await guard(() => api.exportProfiles(path));
    if (written) {
      notify(`Exported ${profiles.length} profile${profiles.length === 1 ? "" : "s"} to ${written}`, "good");
    }
  }

  async function startImport() {
    const path = await open({
      title: "Import profiles",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;

    const preview = await guard(() => api.previewImport(path));
    if (preview) setImportPreview(preview);
  }

  async function runImport(overwrite: boolean) {
    if (!importPreview) return;
    const report = await guard(() =>
      api.importProfiles(importPreview.path, overwrite),
    );
    if (!report) return;

    setImportPreview(null);
    await refresh();
    notify(
      `Imported: ${report.added.length} added, ${report.replaced.length} replaced, ${report.skipped.length} skipped.`,
      "good",
    );
  }

  if (loadError) {
    return (
      <EmptyState title="Couldn't read your profiles">
        <p className="mb-3">{loadError}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </EmptyState>
    );
  }

  if (!overview) {
    return <EmptyState title="Loading…" />;
  }

  const health = overview.health.find((h) => h.profileId === selected?.id);

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[13px] font-semibold">Git Switcher</h1>
          <span className="text-[11px] text-ink-faint">
            {profiles.length} profile{profiles.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <span className="text-[11px] text-warn">
              {pendingCount} file{pendingCount === 1 ? "" : "s"} out of date
            </span>
          ) : (
            <span className="text-[11px] text-ink-faint">Config up to date</span>
          )}
          <Button
            variant={pendingCount > 0 ? "primary" : "default"}
            onClick={() => setShowApply(true)}
            disabled={busy}
          >
            Review &amp; apply
          </Button>
        </div>
      </header>

      <StatusStrip
        status={overview.status}
        settings={overview.settings}
        profiles={profiles}
        onWatchDir={watchDir}
        onSetGlobal={setGlobalProfile}
        onRefresh={() => void refresh()}
        busy={busy}
      />

      <main className="flex min-h-0 flex-1">
        <Sidebar
          profiles={profiles}
          health={overview.health}
          status={overview.status}
          selectedId={selectedId}
          globalProfileId={overview.settings.globalProfileId}
          creating={creating}
          onSelect={(id) => {
            setCreating(false);
            setSelectedId(id);
          }}
          onCreate={() => setCreating(true)}
          onExport={exportProfiles}
          onImport={startImport}
          busy={busy}
        />

        <section className="flex min-w-0 flex-1 flex-col bg-canvas">
          {creating || selected ? (
            <>
              <ProfileForm
                key={`${creating ? "new" : selected!.id}:${formNonce}`}
                profile={creating ? null : selected}
                onSave={saveProfile}
                onCancel={() => {
                  if (creating) setCreating(false);
                  else setFormNonce((nonce) => nonce + 1);
                }}
                onDelete={creating ? undefined : deleteProfile}
                busy={busy}
              />
              {!creating && selected ? (
                <KeyPanel
                  profile={selected}
                  health={health}
                  onGenerate={generateKey}
                  onTest={testConnection}
                  test={sshTest}
                  generated={generated}
                  busy={busy}
                />
              ) : null}
            </>
          ) : (
            <EmptyState title="No profile selected">
              <p>
                Add a profile for each account you commit from. Git Switcher
                writes the SSH host alias and the{" "}
                <code className="font-mono">includeIf</code> rules for you, and
                shows which identity is active in the menu bar.
              </p>
            </EmptyState>
          )}
        </section>
      </main>

      <footer className="flex items-center gap-4 border-t border-line bg-surface px-4 py-1.5 font-mono text-[10px] text-ink-faint">
        <span className="truncate">{overview.locations.store}</span>
        <span className="truncate">{overview.locations.sshConfig}</span>
        <span className="truncate">{overview.locations.gitconfig}</span>
      </footer>

      {showApply ? (
        <ApplyModal
          plan={overview.plan}
          onApply={applyChanges}
          onClose={() => setShowApply(false)}
          busy={busy}
        />
      ) : null}

      {importPreview ? (
        <ImportModal
          preview={importPreview}
          onImport={runImport}
          onClose={() => setImportPreview(null)}
          busy={busy}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
