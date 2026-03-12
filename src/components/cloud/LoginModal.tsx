import { useState, useRef, type FormEvent } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { useAuth } from "../../store/authStore";
import { login } from "../../lib/apiClient";
import { startCloudSync } from "../../lib/cloudSync";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useModalA11y } from "../../hooks/useModalA11y";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignUp: () => void;
}

export default function LoginModal({
  isOpen,
  onClose,
  onSwitchToSignUp,
}: LoginModalProps) {
  const { dispatch } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotText, setShowForgotText] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  useModalA11y(onClose);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      dispatch({ type: "LOGIN", payload: { user: result.user, token: result.token } });
      startCloudSync(result.user.id, result.token);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="w-full max-w-sm rounded-xl border border-border-default bg-surface-elevated p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2
            id="login-modal-title"
            className="font-display text-lg font-semibold text-text-heading"
          >
            Sign in to Jninty Cloud
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-text-primary"
            >
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm">
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-primary hover:underline"
          >
            Don&apos;t have an account? Create one
          </button>
          <div>
            <button
              type="button"
              onClick={() => setShowForgotText(true)}
              className="text-text-muted hover:underline"
            >
              Forgot password?
            </button>
            {showForgotText && (
              <p className="mt-1 text-xs text-text-muted">
                Email hello@jninty.com for support
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
