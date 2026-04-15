import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/authClient";
import { useSession } from "../store/sessionStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError("E-Mail oder Passwort ist falsch.");
      } else {
        await refresh();
        void navigate("/");
      }
    } catch {
      setError("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center font-display text-2xl font-bold text-green-800">
          Anmelden
        </h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-text-default"
            >
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-text-default placeholder-text-muted focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="garten@beispiel.de"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-text-default"
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-text-default placeholder-text-muted focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-terracotta-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {isLoading ? "Wird angemeldet…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
