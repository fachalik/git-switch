/**
 * What the app knows about git hosts.
 *
 * One list, shared by the host picker in the profile form and the "open the
 * host's key settings" button — adding a provider is a single edit here.
 *
 * A provider is matched by substring, not equality, so a self-hosted instance
 * (`gitlab.mycompany.com`) still resolves to the right key-settings path.
 */

export interface GitHostProvider {
  id: string;
  label: string;
  /** The provider's own hosted instance — what the picker offers. */
  hostName: string;
  /** Substring that identifies this provider in any hostname. */
  match: string;
  /** Where this provider wants a new public key pasted. */
  keySettingsUrl: (hostName: string) => string;
}

export const GIT_HOST_PROVIDERS: readonly GitHostProvider[] = [
  {
    id: "github",
    label: "GitHub",
    hostName: "github.com",
    match: "github",
    keySettingsUrl: (hostName) => `https://${hostName}/settings/keys`,
  },
  {
    id: "gitlab",
    label: "GitLab",
    hostName: "gitlab.com",
    match: "gitlab",
    keySettingsUrl: (hostName) => `https://${hostName}/-/user_settings/ssh_keys`,
  },
  {
    id: "bitbucket",
    label: "Bitbucket",
    hostName: "bitbucket.org",
    // Account-scoped rather than per-host, so the hostname is ignored.
    match: "bitbucket",
    keySettingsUrl: () => "https://bitbucket.org/account/settings/ssh-keys/",
  },
];

/** The provider a hostname belongs to, or `null` for anything unrecognised. */
export function providerFor(hostName: string): GitHostProvider | null {
  const needle = hostName.trim().toLowerCase();
  return (
    GIT_HOST_PROVIDERS.find((provider) => needle.includes(provider.match)) ??
    null
  );
}

/** True when the hostname is one of the providers' own instances. */
export function isKnownHostName(hostName: string): boolean {
  const needle = hostName.trim().toLowerCase();
  return GIT_HOST_PROVIDERS.some((provider) => provider.hostName === needle);
}

/**
 * Where to paste a public key for this host. An unrecognised host falls back
 * to GitHub's layout, which is a guess — it's right for GitHub Enterprise and
 * wrong for, say, Gitea.
 */
export function keySettingsUrl(hostName: string): string {
  const provider = providerFor(hostName);
  return provider
    ? provider.keySettingsUrl(hostName)
    : `https://${hostName}/settings/keys`;
}
