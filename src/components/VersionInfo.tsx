import { useEffect, useState } from "react";
import { apiUrl } from "../config/cloud";

export default function VersionInfo() {
  const [serverVersion, setServerVersion] = useState<{ version: string; commit: string } | null>(null);

  useEffect(() => {
    const apiBase = apiUrl ?? "/api";
    fetch(`${apiBase}/version`)
      .then((r) => r.json() as Promise<{ version: string; commit: string }>)
      .then(setServerVersion)
      .catch(() => { /* ignore */ });
  }, []);

  const feCommit = __GIT_COMMIT__;
  const mismatch = serverVersion !== null && serverVersion.commit !== feCommit;

  return (
    <div className="text-center text-xs text-text-muted space-y-0.5">
      <p>Frontend v{__APP_VERSION__} <span className="font-mono opacity-60">({feCommit})</span></p>
      {serverVersion ? (
        <p className={mismatch ? "text-terracotta-600" : ""}>
          Server v{serverVersion.version} <span className="font-mono opacity-60">({serverVersion.commit})</span>
          {mismatch && " ⚠ abweichend"}
        </p>
      ) : (
        <p className="opacity-50">Server …</p>
      )}
    </div>
  );
}
