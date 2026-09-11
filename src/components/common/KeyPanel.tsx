import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plug,
  RefreshCw,
} from "lucide-react";

import { keySettingsUrl } from "@/lib/hosts";
import type { GeneratedKey, KeyHealth, Profile, SshTest } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function KeyPanel({
  profile,
  health,
  onGenerate,
  onTest,
  test,
  generated,
  generating,
  testing,
  busy,
}: {
  profile: Profile;
  health: KeyHealth | undefined;
  onGenerate: (overwrite: boolean) => void;
  onTest: () => void;
  test: SshTest | null;
  generated: GeneratedKey | null;
  generating: boolean;
  testing: boolean;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // A public key is not a secret, but it is a stable identifier that follows
  // you across every host you register it with — and this panel is the one
  // people screenshot. Hidden until asked for; the fingerprint above is what
  // you identify a key by anyway, and Copy never needs it revealed.
  //
  // Held as the profile it was revealed for, not a bare boolean: this panel is
  // reused across profiles rather than remounted, so a boolean would carry the
  // reveal over to the next profile's key.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const revealed = revealedFor === profile.id;

  const publicKey = generated?.publicKey ?? health?.publicKey ?? null;
  // "ssh-ed25519" — the half of the line that describes the key rather than
  // identifying it, so it stays visible while the rest is masked.
  const keyType = publicKey?.split(" ")[0] ?? "";
  const exists = health?.privateKeyExists ?? false;

  // Both of these reach the OS through a Tauri plugin, so both can be refused
  // by the capability scope. A rejected promise here is invisible unless it is
  // caught — the button just does nothing — so surface it.
  async function copyPublicKey() {
    if (!publicKey) return;
    try {
      await writeText(publicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      toast.error("Couldn't copy the public key", {
        description: String(error),
      });
    }
  }

  async function openKeySettings() {
    const url = keySettingsUrl(profile.hostName);
    try {
      await openUrl(url);
    } catch (error) {
      toast.error(`Couldn't open ${url}`, { description: String(error) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase">
            <KeyRound className="size-3.5" />
            SSH key
          </span>
          {health ? (
            exists ? (
              <Badge variant="success">Key present</Badge>
            ) : (
              <Badge variant="warning">Not generated yet</Badge>
            )
          ) : null}
          {health && exists && !health.permissionsOk ? (
            <Badge variant="destructive">Permissions too open</Badge>
          ) : null}
        </CardTitle>

        <CardAction className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGenerate(exists)}
            disabled={busy}
          >
            {generating ? (
              <LoaderCircle className="animate-spin" />
            ) : exists ? (
              <RefreshCw />
            ) : (
              <KeyRound />
            )}
            {generating
              ? "Generating…"
              : exists
                ? "Regenerate…"
                : "Generate key"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={busy || !exists}
          >
            {testing ? <LoaderCircle className="animate-spin" /> : <Plug />}
            {testing ? "Testing…" : "Test connection"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {health ? (
          <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 font-mono text-[0.6875rem]">
            <span className="truncate">{health.privateKeyPath}</span>
            {health.fingerprint ? (
              <span className="truncate opacity-80">{health.fingerprint}</span>
            ) : null}
          </div>
        ) : null}

        {!exists ? (
          <p className="text-muted-foreground text-[0.6875rem] leading-snug">
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
          <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">
                Public key{generated ? " — register it now" : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={revealed}
                  onClick={() =>
                    setRevealedFor(revealed ? null : profile.id)
                  }
                >
                  {revealed ? <EyeOff /> : <Eye />}
                  {revealed ? "Hide" : "Reveal"}
                </Button>
                <Button variant="outline" size="sm" onClick={copyPublicKey}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openKeySettings}
                >
                  <ExternalLink />
                  {profile.hostName} keys
                </Button>
              </div>
            </div>
            {revealed ? (
              <code className="bg-card text-muted-foreground block max-h-24 overflow-auto rounded-md border p-2 font-mono text-[0.6875rem] break-all">
                {publicKey}
              </code>
            ) : (
              // The algorithm stays readable — it says what kind of key this is
              // without saying which one. A fixed run of dots, so the length
              // gives nothing away either. `select-none` keeps a drag-select
              // from lifting the dots instead of the key; Copy is the way out.
              <code className="bg-card text-muted-foreground block rounded-md border p-2 font-mono text-[0.6875rem] break-all select-none">
                <span className="sr-only">Public key hidden. </span>
                {keyType ? `${keyType} ` : null}
                <span className="tracking-[0.2em] opacity-60" aria-hidden>
                  {"•".repeat(40)}
                </span>
              </code>
            )}
            {generated ? (
              <p className="text-warning text-[0.6875rem] leading-snug">
                This key is new. Until you paste it into {profile.hostName},
                pushes using this profile will be rejected.
              </p>
            ) : null}
          </div>
        ) : null}

        {testing ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem]">
            <LoaderCircle className="size-3 animate-spin" />
            Opening an SSH connection to {profile.hostAlias}…
          </p>
        ) : null}

        {test && !testing ? (
          <Alert variant={test.ok ? "success" : "destructive"}>
            <AlertTitle>
              {test.ok
                ? `Authenticated to ${test.hostAlias}`
                : `Could not authenticate to ${test.hostAlias}`}
            </AlertTitle>
            <AlertDescription>
              <pre className="w-full font-mono break-words whitespace-pre-wrap">
                {test.output || "(no output)"}
              </pre>
              {!test.ok ? (
                <p>
                  If the host alias isn't in ~/.ssh/config yet, apply your
                  changes first.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
