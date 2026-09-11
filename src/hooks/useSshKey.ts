import { useEffect, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { GeneratedKey, Profile, SshTest } from "@/lib/types";
import type { CommandKey, RunCommand } from "@/hooks/useOverview";

/**
 * The SSH key belonging to the profile on screen. A test result or a freshly
 * generated key says nothing about the next profile, so both are dropped the
 * moment the pane switches.
 */
export function useSshKey({
  profile,
  run,
  refresh,
  pending,
}: {
  profile: Profile | null;
  run: RunCommand;
  refresh: () => Promise<void>;
  pending: CommandKey | null;
}) {
  const [test, setTest] = useState<SshTest | null>(null);
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);

  useEffect(() => {
    setTest(null);
    setGenerated(null);
  }, [profile?.id]);

  async function generate(overwrite: boolean) {
    if (!profile) return;
    if (overwrite) {
      const confirmed = await confirm(
        `Replace the existing key at ${profile.sshKeyPath}?\n\nThe old key is copied to a .bak file, but anything that trusts it — hosts, servers, signed commits — stops working until you register the new one.`,
        { title: "Regenerate SSH key", kind: "warning", okLabel: "Replace key" },
      );
      if (!confirmed) return;
    }

    const key = await run("generate-key", () =>
      api.generateKey(profile.id, overwrite),
    );
    if (!key) return;
    setGenerated(key);
    setTest(null);
    await refresh();
    toast.success("Key created", {
      description: `${key.privateKeyPath} — register the public key next.`,
    });
  }

  async function testConnection() {
    if (!profile) return;
    const result = await run("test-ssh", () => api.testSsh(profile.id));
    if (result) setTest(result);
  }

  return {
    test,
    generated,
    generate,
    testConnection,
    generating: pending === "generate-key",
    testing: pending === "test-ssh",
  };
}
