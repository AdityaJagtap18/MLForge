import { useEffect, useState, type ReactNode } from "react";
import { AuthModal } from "../auth/AuthModal";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Icon } from "../ui/Icon";

export function AppShell({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  function checkAuth() {
    const hasToken = Boolean(localStorage.getItem("mlforge_token"));
    const hasApiKey = Boolean(localStorage.getItem("mlforge_api_key"));
    setIsAuthenticated(hasToken || hasApiKey);
  }

  useEffect(() => {
    checkAuth();
    window.addEventListener("storage", checkAuth);
    return () => window.removeEventListener("storage", checkAuth);
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {!isAuthenticated && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-ink shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/20 p-2 text-primary">
                  <Icon name="alert-triangle" className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-ink">Authentication Required in Production</div>
                  <div className="text-xs text-muted">
                    Sign in with your account or enter an API key to view live telemetry and manage models.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow hover:bg-primary-hover transition-colors"
              >
                Sign In / Register
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          checkAuth();
          window.location.reload();
        }}
      />
    </div>
  );
}
