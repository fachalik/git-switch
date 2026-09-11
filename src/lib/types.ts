/** Mirrors the `serde` shapes in `src-tauri/src`. Keep the two in step. */

export interface Profile {
  id: string;
  alias: string;
  name: string;
  email: string;
  hostName: string;
  hostAlias: string;
  sshKeyPath: string;
  dirs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  alias: string;
  name: string;
  email: string;
  hostName: string;
  hostAlias: string;
  sshKeyPath: string;
  dirs: string[];
}

export interface Settings {
  watchedDir: string | null;
  recentDirs: string[];
}

export interface KeyHealth {
  profileId: string;
  privateKeyPath: string;
  publicKeyPath: string;
  privateKeyExists: boolean;
  publicKeyExists: boolean;
  permissionsOk: boolean;
  fingerprint: string | null;
  publicKey: string | null;
}

export type IdentityState = "matched" | "unregistered" | "unset" | "missing";

export interface Identity {
  scope: "global" | "directory";
  dir: string | null;
  dirExists: boolean;
  isGitRepo: boolean;
  name: string | null;
  email: string | null;
  matchedAlias: string | null;
  state: IdentityState;
  origin: string | null;
  remoteUrl: string | null;
  /** Profile whose configured folders cover this path, if any. */
  folderRuleAlias: string | null;
}

export interface Snapshot {
  global: Identity;
  directory: Identity | null;
  checkedAt: string;
}

export interface FileChange {
  path: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
  exists: boolean;
  orphan: boolean;
}

export interface Plan {
  changes: FileChange[];
  hasChanges: boolean;
}

export interface ApplyReport {
  written: string[];
  removed: string[];
  backups: string[];
}

export interface Locations {
  store: string;
  sshConfig: string;
  gitconfig: string;
}

export interface Overview {
  profiles: Profile[];
  settings: Settings;
  health: KeyHealth[];
  status: Snapshot;
  plan: Plan;
  locations: Locations;
}

export interface GeneratedKey {
  privateKeyPath: string;
  publicKeyPath: string;
  publicKey: string;
  fingerprint: string | null;
}

export interface SshTest {
  ok: boolean;
  hostAlias: string;
  output: string;
}

export interface ImportEntry {
  alias: string;
  name: string;
  email: string;
  hostAlias: string;
  status: "new" | "conflict" | "identical" | "invalid";
  detail: string | null;
}

export interface ImportPreview {
  path: string;
  exportedAt: string;
  entries: ImportEntry[];
  newCount: number;
  conflictCount: number;
}

export interface ImportReport {
  added: string[];
  replaced: string[];
  skipped: string[];
}

/** Every command rejects with this shape — see `error.rs`. */
export interface AppError {
  kind: "validation" | "not_found" | "conflict" | "io" | "command" | "json";
  message: string;
}
