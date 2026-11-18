import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { AuthModal } from "../auth/AuthModal";
import { Icon } from "../ui/Icon";

interface UserInfo {
  id?: string;
  email?: string;
}

export function Header() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  function syncAuth() {
    const rawUser = localStorage.getItem("mlforge_user");
    if (rawUser) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setHasApiKey(Boolean(localStorage.getItem("mlforge_api_key")));
  }

  useEffect(() => {
    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  const isAuthenticated = Boolean(user || localStorage.getItem("mlforge_token") || hasApiKey);

  const displayName = user?.email
    ? user.email.split("@")[0]
    : hasApiKey
    ? "System Admin"
    : "Anonymous";

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : hasApiKey
    ? "SA"
    : "G";

  async function handleLogout() {
    try {
      await api.logout().catch(() => ({ revoked: false }));
    } finally {
      localStorage.removeItem("mlforge_token");
      localStorage.removeItem("mlforge_user");
      localStorage.removeItem("mlforge_api_key");
      setUser(null);
      setHasApiKey(false);
      setShowUserMenu(false);
      window.location.reload();
    }
  }

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-8">
        <div className="flex w-[420px] items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
          <Icon name="search" className="h-4 w-4 text-muted" />
          <input
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            placeholder="Search datasets, experiments, models..."
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">⌘K</kbd>
        </div>

        <div className="flex items-center gap-5">
          <button aria-label="Notifications" className="relative text-ink">
            <Icon name="bell" className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
          </button>

          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-bg transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-sm">
                  {initials}
                </div>
                <div className="text-left text-sm leading-tight">
                  <div className="font-medium text-ink">{displayName}</div>
                  <div className="text-xs text-muted">
                    {hasApiKey && !user ? "API Key Mode" : "Authenticated"}
                  </div>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-xl z-50">
                  <div className="px-3 py-2 text-xs text-muted border-b border-line mb-1">
                    {user?.email || "Signed in with API Key"}
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowAuthModal(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-bg"
                  >
                    Switch Account / API Key
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-hover transition-colors"
            >
              Sign In / Register
            </button>
          )}
        </div>
      </header>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          syncAuth();
          window.location.reload();
        }}
      />
    </>
  );
}
