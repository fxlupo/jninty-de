import { z } from "zod";

const STORAGE_KEY = "jninty:syncConfig";

const SyncConfigSchema = z.object({
  remoteUrl: z.string().min(1),
  username: z.string(),
  password: z.string(),
  enabled: z.boolean(),
  lastSynced: z.string().nullable(),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return SyncConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
