import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../store/sessionStore";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50">
        <span className="text-sm text-text-muted">Wird geladen…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
