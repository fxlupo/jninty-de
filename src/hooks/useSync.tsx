/**
 * Sync has been removed — CouchDB replication is no longer supported.
 * This stub keeps the existing call-sites compiling without changes.
 */
import { createContext, useContext, type ReactNode } from "react";

interface SyncContextValue {
  status: "disabled";
  lastSynced: null;
  isConfigured: false;
  startSync: () => void;
  stopSync: () => void;
  testConnection: () => Promise<never>;
}

const STUB: SyncContextValue = {
  status: "disabled",
  lastSynced: null,
  isConfigured: false,
  startSync: () => {},
  stopSync: () => {},
  testConnection: () => Promise.reject(new Error("Sync not available")),
};

const SyncContext = createContext<SyncContextValue>(STUB);

export function SyncProvider({ children }: { children: ReactNode }) {
  return <SyncContext.Provider value={STUB}>{children}</SyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
