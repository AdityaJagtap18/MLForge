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
  const [tab, setTab] = useState<"login" | "register" | "apikey" | "demo">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState(api.getStoredApiKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleDemoLogin() {
    setLoading(true);
    setError(null);
    try {
      await api.loginDemo();
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start demo session.");
    } finally {
      setLoading(false);
    }
  }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-bg hover:text-ink transition-colors"
          aria-label="Close"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>

        <div className="mb-5 pr-6">
          <h2 className="text-lg sm:text-xl font-bold text-ink">Authentication &amp; Access</h2>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            Sign in, launch instant demo mode, or provide a system API key to access MLForge.
          </p>
        </div>

        {/* Tab navigation - horizontally scrollable on small mobile */}
        <div className="mb-5 flex border-b border-line overflow-x-auto no-scrollbar gap-1">
          <button
            onClick={() => { setTab("login"); setError(null); }}
            className={`whitespace-nowrap pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors ${
              tab === "login"
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("demo"); setError(null); }}
            className={`whitespace-nowrap pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === "demo"
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
            Demo Mode
          </button>
          <button
            onClick={() => { setTab("register"); setError(null); }}
            className={`whitespace-nowrap pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors ${
              tab === "register"
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            Register
          </button>
          <button
            onClick={() => { setTab("apikey"); setError(null); }}
            className={`whitespace-nowrap pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors ${
              tab === "apikey"
                ? "border-b-2 border-primary text-primary font-semibold"
                : "text-muted hover:text-ink"
            }`}
          >
            API Key
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
            <Icon name="alert-triangle" className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* DEMO MODE TAB */}
        {tab === "demo" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1">
                <Icon name="check-circle" className="h-4 w-4" />
                <span>Instant Demo Mode</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Experience MLForge immediately with full access to datasets, model training, AutoML candidate search, model registry, and monitoring.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-ink">
                <li className="flex items-center gap-2">
                  <span className="text-primary font-bold">✓</span> No password or email verification needed
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary font-bold">✓</span> Preloaded with demo telemetry &amp; models
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary font-bold">✓</span> Full feature access across all 11 views
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Entering Demo Mode...
                </>
              ) : (
                <>
                  <Icon name="arrow-right" className="h-4 w-4 text-white" />
                  Launch Demo Mode Directly
                </>
              )}
            </button>
          </div>
        )}

        {/* LOGIN TAB (With prominent Demo Login button) */}
        {tab === "login" && (
          <div className="space-y-4">
            {/* Quick Demo Login Option Banner */}
            <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 to-amber/10 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
                  QUICK EXPLORATION
                </span>
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  1-CLICK
                </span>
              </div>
              <p className="text-xs text-muted mb-2.5">
                Want to test features right now without logging in?
              </p>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {loading ? "Starting Demo..." : "🚀 Enter Direct Demo Mode"}
              </button>
            </div>

            <div className="relative my-2 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative bg-surface px-2.5 text-[11px] uppercase tracking-wider text-muted font-medium">
                Or Sign In With Account
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-3.5">
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
                  className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
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
                  className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-ink py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </form>
          </div>
        )}

        {/* REGISTER TAB */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="space-y-3.5">
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
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
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
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        )}

        {/* API KEY TAB */}
        {tab === "apikey" && (
          <form onSubmit={handleSaveApiKey} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                MLForge API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your MLFORGE_API_KEY"
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none font-mono"
              />
              <p className="mt-1 text-xs text-muted">
                Service-account key configured via MLFORGE_API_KEY environment variable.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-primary py-2.5 text-xs sm:text-sm font-semibold text-white shadow hover:bg-primary-hover"
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
                  className="rounded-lg border border-line px-3 py-2.5 text-xs sm:text-sm font-medium text-muted hover:text-ink"
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
