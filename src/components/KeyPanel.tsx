import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GeneratedKey, KeyHealth, Profile, SshTest } from "../lib/types";
import { Badge, Button } from "./ui";

/** Where each host wants a new public key pasted. */
function keySettingsUrl(hostName: string) {
  if (hostName.includes("gitlab")) return `https://${hostName}/-/user_settings/ssh_keys`;
  if (hostName.includes("bitbucket"))
    return "https://bitbucket.org/account/settings/ssh-keys/";
  return `https://${hostName}/settings/keys`;
}

export function KeyPanel({
  profile,
  health,
  onGenerate,
  onTest,
  test,
  generated,
  busy,
}: {
  profile: Profile;
  health: KeyHealth | undefined;
  onGenerate: (overwrite: boolean) => void;
  onTest: () => void;
  test: SshTest | null;
  generated: GeneratedKey | null;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const publicKey = generated?.publicKey ?? health?.publicKey ?? null;
  const exists = health?.privateKeyExists ?? false;

  async function copyPublicKey() {
    if (!publicKey) return;
    await writeText(publicKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-sunken px-5 py-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              SSH key
            </h3>
            {health ? (
              exists ? (
                <Badge tone="good">Key present</Badge>
              ) : (
                <Badge tone="warn">Not generated yet</Badge>
              )
            ) : null}
            {health && exists && !health.permissionsOk ? (
              <Badge tone="bad">Permissions too open</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => onGenerate(exists)} disabled={busy}>
              {exists ? "Regenerate key…" : "Generate key"}
            </Button>
            <Button onClick={onTest} disabled={busy || !exists}>
              Test connection
            </Button>
          </div>
        </div>

        {health ? (
          <div className="flex flex-col gap-0.5 font-mono text-[11px] text-ink-soft">
            <span className="truncate">{health.privateKeyPath}</span>
            {health.fingerprint ? (
              <span className="truncate text-ink-faint">
                {health.fingerprint}
              </span>
            ) : null}
          </div>
        ) : null}

        {!exists ? (
          <p className="text-[11px] leading-snug text-ink-faint">
            Generating creates an ed25519 keypair with no passphrase. To add one
            afterwards, run{" "}
            <code className="font-mono">
              ssh-keygen -p -f {health?.privateKeyPath ?? profile.sshKeyPath}
            </code>{" "}
            — the app won't take a passphrase, because anything on a command
            line is visible to every process on the machine.
          </p>
        ) : null}

        {publicKey ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-ink">
                Public key{generated ? " — register it now" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button onClick={copyPublicKey}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  onClick={() => openUrl(keySettingsUrl(profile.hostName))}
                >
                  Open {profile.hostName} keys
                </Button>
              </div>
            </div>
            <code className="block max-h-24 overflow-auto rounded bg-sunken p-2 font-mono text-[11px] break-all text-ink-soft">
              {publicKey}
            </code>
            {generated ? (
              <p className="text-[11px] leading-snug text-warn">
                This key is new. Until you paste it into {profile.hostName},
                pushes using this profile will be rejected.
              </p>
            ) : null}
          </div>
        ) : null}

        {test ? (
          <div
            className={`rounded-lg border p-3 text-[11px] ${
              test.ok
                ? "border-good/40 bg-good-soft text-good"
                : "border-bad/40 bg-bad-soft text-bad"
            }`}
          >
            <p className="font-medium">
              {test.ok
                ? `Authenticated to ${test.hostAlias}`
                : `Could not authenticate to ${test.hostAlias}`}
            </p>
            <pre className="mt-1 font-mono break-words whitespace-pre-wrap">
              {test.output || "(no output)"}
            </pre>
            {!test.ok ? (
              <p className="mt-1">
                If the host alias isn't in ~/.ssh/config yet, apply your changes
                first.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
