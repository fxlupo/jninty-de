import { useNavigate } from "react-router-dom";
import { isCloudEnabled } from "../../config/cloud";
import { useIsAuthenticated } from "../../store/authStore";
import { useCloudSync } from "../../hooks/useCloudSync";
import { format } from "date-fns";

export default function SyncStatusBadge() {
  const isAuthenticated = useIsAuthenticated();
  const { status, lastSyncedAt } = useCloudSync();
  const navigate = useNavigate();

  if (!isCloudEnabled || !isAuthenticated) return null;

  const tooltip = (() => {
    switch (status) {
      case "syncing":
        return "Cloud: Syncing...";
      case "paused":
        return lastSyncedAt
          ? `Cloud: Synced at ${format(lastSyncedAt, "h:mm a")}`
          : "Cloud: Synced";
      case "error":
        return "Cloud: Sync error";
      case "idle":
        return "Cloud: Up to date";
    }
  })();

  return (
    <button
      type="button"
      onClick={() => navigate("/settings")}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-primary/50"
      title={tooltip}
    >
      {status === "syncing" ? (
        <svg
          className="h-4 w-4 animate-spin text-text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      ) : status === "error" ? (
        <svg
          className="h-4 w-4 text-red-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
          <line x1="15" y1="13" x2="15" y2="17" />
          <line x1="15" y1="19" x2="15.01" y2="19" />
        </svg>
      ) : (
        <svg
          className="h-4 w-4 text-green-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      )}
    </button>
  );
}
