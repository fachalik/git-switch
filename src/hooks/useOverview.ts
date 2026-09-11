import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

import { api, asAppError } from "@/lib/api";
import type { Overview, Snapshot } from "@/lib/types";

/**
 * Names the command in flight. One global "busy" was enough to stop the user
 * starting a second write, but not to say which button they're waiting on —
 * testing a connection made every other control look like it was working.
 */
export type CommandKey =
  | "save-profile"
  | "delete-profile"
  | "generate-key"
  | "test-ssh"
  | "apply"
  | "watch-dir"
  | "set-global"
  | "export"
  | "import-preview"
  | "import";

/** Runs one backend command, surfacing any failure as a toast. */
export type RunCommand = <T>(
  key: CommandKey,
  command: () => Promise<T>,
) => Promise<T | undefined>;

/**
 * The window's mirror of backend state, and the one way to change it.
 *
 * Most commands answer with a fresh `Overview`, so callers hand the result
 * straight to `setOverview` rather than paying for a second round-trip.
 */
export function useOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<CommandKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setOverview(await api.getOverview());
      setLoadError(null);
    } catch (error) {
      setLoadError(asAppError(error).message);
    } finally {
      setRefreshing(false);
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

  // Switching identity from the menu bar moves settings and writes config
  // files, so the snapshot above is not enough — everything the window renders
  // is stale. Re-read it.
  useEffect(() => {
    const unlisten = listen("store-changed", () => {
      void refresh();
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [refresh]);

  // The menu bar has nowhere to report a failure of its own.
  useEffect(() => {
    const unlisten = listen<string>("tray-error", (event) => {
      toast.error(event.payload);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  /** Wrap a command so every failure surfaces, never a silent no-op. */
  const run = useCallback<RunCommand>(async (key, command) => {
    setPending(key);
    try {
      return await command();
    } catch (error) {
      toast.error(asAppError(error).message);
      return undefined;
    } finally {
      setPending(null);
    }
  }, []);

  return {
    overview,
    setOverview,
    loadError,
    /** Which command is running, for the button that started it. */
    pending,
    /** Any command is running — still enough to lock out a second write. */
    busy: pending !== null,
    refreshing,
    refresh,
    run,
  };
}
