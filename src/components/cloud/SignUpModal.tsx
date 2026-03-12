import { useState, useRef, type FormEvent } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { register } from "../../lib/apiClient";
import {
  stripeMonthlyPriceId,
  stripeAnnualPriceId,
  monthlyPrice,
  annualPrice,
} from "../../config/cloud";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useModalA11y } from "../../hooks/useModalA11y";

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

function getPasswordStrength(pw: string): {
  label: string;
  color: string;
  width: string;
} {
  if (pw.length < 8) return { label: "Too short", color: "bg-red-500", width: "w-1/4" };
  let score = 0;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;

  if (score <= 2) return { label: "Weak", color: "bg-amber-500", width: "w-1/3" };
  if (score <= 3) return { label: "Good", color: "bg-blue-500", width: "w-2/3" };
  return { label: "Strong", color: "bg-green-600", width: "w-full" };
}

export default function SignUpModal({
  isOpen,
  onClose,
  onSwitchToLogin,
}: SignUpModalProps) {
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  useModalA11y(onClose);

  if (!isOpen) return null;

  const strength = getPasswordStrength(password);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!email.includes("@") || !email.includes(".")) {
      errors["email"] = "Please enter a valid email address";
    }
    if (password.length < 8) {
      errors["password"] = "Password must be at least 8 characters";
    }
    if (password !== confirmPassword) {
      errors["confirmPassword"] = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    const priceId =
      plan === "annual" ? stripeAnnualPriceId : stripeMonthlyPriceId;
    if (!priceId) {
      setError("Pricing not configured. Please contact support.");
      return;
    }

    setLoading(true);
    try {
      const result = await register(email, password, priceId);
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
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
        aria-labelledby="signup-modal-title"
        className="w-full max-w-sm rounded-xl border border-border-default bg-surface-elevated p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2
            id="signup-modal-title"
            className="font-display text-lg font-semibold text-text-heading"
          >
            Start Jninty Cloud
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

        {/* Plan toggle */}
        <div className="mt-4">
          <div className="inline-flex w-full overflow-hidden rounded-lg border border-border-strong">
            <button
              type="button"
              onClick={() => setPlan("monthly")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                plan === "monthly"
                  ? "bg-primary text-text-on-primary"
                  : "bg-surface-elevated text-text-secondary hover:bg-surface-muted"
              }`}
            >
              Monthly — {monthlyPrice}
            </button>
            <button
              type="button"
              onClick={() => setPlan("annual")}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                plan === "annual"
                  ? "bg-primary text-text-on-primary"
                  : "bg-surface-elevated text-text-secondary hover:bg-surface-muted"
              }`}
            >
              Annual — {annualPrice} (save 17%)
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-4 space-y-4"
          noValidate
        >
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-text-primary"
            >
              Email
            </label>
            <Input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next["email"];
                  return next;
                });
              }}
              className="mt-1"
              autoComplete="email"
            />
            {fieldErrors["email"] && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors["email"]}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <Input
              id="signup-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next["password"];
                  return next;
                });
              }}
              className="mt-1"
              autoComplete="new-password"
            />
            {password.length > 0 && (
              <div className="mt-1.5">
                <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={`h-full rounded-full transition-all ${strength.color} ${strength.width}`}
                  />
                </div>
                <p className="mt-0.5 text-xs text-text-muted">
                  {strength.label}
                </p>
              </div>
            )}
            {fieldErrors["password"] && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors["password"]}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="signup-confirm-password"
              className="block text-sm font-medium text-text-primary"
            >
              Confirm Password
            </label>
            <Input
              id="signup-confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next["confirmPassword"];
                  return next;
                });
              }}
              className="mt-1"
              autoComplete="new-password"
            />
            {fieldErrors["confirmPassword"] && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors["confirmPassword"]}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Redirecting...
              </span>
            ) : (
              "Continue to Payment"
            )}
          </Button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary hover:underline"
          >
            Already have an account? Sign in
          </button>
          <p className="text-xs text-text-muted">
            You&apos;ll be redirected to Stripe to complete payment. Cancel
            anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
