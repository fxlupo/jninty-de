import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  setupSync,
  stopSync as stopSyncClient,
  getSyncStatus,
  subscribeSyncStatus,
  getLastSyncedAt,
  testConnection as testConnectionClient,
  type SyncStatus,
} from "../db/pouchdb/client.ts";
import {
  getSyncConfig,
  saveSyncConfig,
  type SyncConfig,
} from "../services/syncConfigStore.ts";
import { autoResolveByLastWrite } from "../services/conflictResolver.ts";

interface SyncContextValue {
  status: SyncStatus;
  lastSynced: string | null;
  isConfigured: boolean;
  startSync: (config: SyncConfig) => void;
  stopSync: () => void;
  testConnection: typeof testConnectionClient;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function getServerSnapshot(): SyncStatus {
  return "disabled";
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const status = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    getServerSnapshot,
  );

  const config = getSyncConfig();
  const lastSynced = getLastSyncedAt() ?? config?.lastSynced ?? null;
  const isConfigured = config != null && config.enabled;

  // Auto-start sync on mount if config exists and is enabled
  useEffect(() => {
    const stored = getSyncConfig();
    if (!stored?.enabled) return;

    const creds =
      stored.username && stored.password
        ? { username: stored.username, password: stored.password }
        : undefined;
    setupSync(stored.remoteUrl, creds);

    return () => {
      stopSyncClient();
    };
  }, []);

  // When sync becomes paused (caught up), auto-resolve conflicts and persist lastSynced
  useEffect(() => {
    if (status !== "paused") return;

    autoResolveByLastWrite().catch(console.error);

    const stored = getSyncConfig();
    if (stored) {
      saveSyncConfig({ ...stored, lastSynced: new Date().toISOString() });
    }
  }, [status]);

  const startSync = useCallback((cfg: SyncConfig) => {
    saveSyncConfig({ ...cfg, enabled: true });
    const creds =
      cfg.username && cfg.password
        ? { username: cfg.username, password: cfg.password }
        : undefined;
    setupSync(cfg.remoteUrl, creds);
  }, []);

  const stopSyncFn = useCallback(() => {
    stopSyncClient();
    const stored = getSyncConfig();
    if (stored) {
      saveSyncConfig({ ...stored, enabled: false });
    }
  }, []);

  return (
    <SyncContext.Provider
      value={{
        status,
        lastSynced,
        isConfigured,
        startSync,
        stopSync: stopSyncFn,
        testConnection: testConnectionClient,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return ctx;
}
