import { useState, useEffect, useRef } from "react";
import {
  getCloudSyncStatus,
  onCloudSyncStatusChange,
  type CloudSyncStatus,
} from "../lib/cloudSync";

export function useCloudSync(): {
  status: CloudSyncStatus;
  lastSyncedAt: Date | null;
} {
  const [status, setStatus] = useState<CloudSyncStatus>(getCloudSyncStatus);
  const lastSyncedRef = useRef<Date | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsubscribe = onCloudSyncStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === "paused") {
        const now = new Date();
        lastSyncedRef.current = now;
        setLastSyncedAt(now);
      }
    });
    return unsubscribe;
  }, []);

  return { status, lastSyncedAt };
}
