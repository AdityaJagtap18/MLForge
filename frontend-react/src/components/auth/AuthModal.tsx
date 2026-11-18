import { useState } from "react";
import { api } from "../../api/client";
import { ApiError } from "../../api/types";
import { Icon } from "../ui/Icon";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register" | "apikey">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState(api.getStoredApiKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login({ email, password });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.register({ email, password });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to register account.");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    api.setApiKey(apiKey);
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted hover:text-ink"
          aria-label="Close"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-ink">Authentication Required</h2>
          <p className="mt-1 text-sm text-muted">
            Sign in, create an account, or provide a system API key to access MLForge.
          </p>
        </div>

        <div className="mb-6 flex border-b border-line">
          <button
            onClick={() => { setTab("login"); setError(null); }}
            className={`pb-2.5 px-3 text-sm font-medium transition-colors ${
              tab === "login"
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("register"); setError(null); }}
            className={`pb-2.5 px-3 text-sm font-medium transition-colors ${
              tab === "register"
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            Create Account
          </button>
          <button
            onClick={() => { setTab("apikey"); setError(null); }}
            className={`pb-2.5 px-3 text-sm font-medium transition-colors ${
              tab === "apikey"
                ? "border-b-2 border-primary text-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            System API Key
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        )}

        {tab === "apikey" && (
          <form onSubmit={handleSaveApiKey} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                MLForge API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your MLFORGE_API_KEY"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none font-mono"
              />
              <p className="mt-1 text-xs text-muted">
                Service-account key configured via MLFORGE_API_KEY environment variable.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-hover"
              >
                Save API Key
              </button>
              {apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    api.setApiKey("");
                    setApiKey("");
                    onSuccess();
                  }}
                  className="rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-muted hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
