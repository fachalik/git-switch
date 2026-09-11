import { invoke } from "@tauri-apps/api/core";
import type {
  ApplyReport,
  AppError,
  GeneratedKey,
  ImportPreview,
  ImportReport,
  Overview,
  Plan,
  ProfileInput,
  Snapshot,
  SshTest,
} from "./types";

/** Narrow an unknown rejection to the `{ kind, message }` the backend sends. */
export function asAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    return error as AppError;
  }
  return { kind: "command", message: String(error) };
}

export const api = {
  getOverview: () => invoke<Overview>("get_overview"),

  createProfile: (input: ProfileInput) =>
    invoke<Overview>("create_profile", { input }),

  updateProfile: (id: string, input: ProfileInput) =>
    invoke<Overview>("update_profile", { id, input }),

  deleteProfile: (id: string) => invoke<Overview>("delete_profile", { id }),

  previewApply: () => invoke<Plan>("preview_apply"),

  applyConfig: () => invoke<ApplyReport>("apply_config"),

  generateKey: (id: string, overwrite: boolean) =>
    invoke<GeneratedKey>("generate_key", { id, overwrite }),

  testSsh: (id: string) => invoke<SshTest>("test_ssh", { id }),

  setWatchedDir: (dir: string | null) =>
    invoke<Overview>("set_watched_dir", { dir }),

  getStatus: () => invoke<Snapshot>("get_status"),

  exportProfiles: (path: string) => invoke<string>("export_profiles", { path }),

  previewImport: (path: string) =>
    invoke<ImportPreview>("preview_import", { path }),

  importProfiles: (path: string, overwrite: boolean) =>
    invoke<ImportReport>("import_profiles", { path, overwrite }),
};
