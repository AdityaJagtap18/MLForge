import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import { AuthModal } from "../auth/AuthModal";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Icon } from "../ui/Icon";

export function AppShell({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  async function handleDemoLogin() {
    try {
      await api.loginDemo();
      checkAuth();
      window.location.reload();
    } catch (err) {
      console.error("Demo login error:", err);
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenMenu={() => setMobileNavOpen(true)}
          onDemoLogin={handleDemoLogin}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {!isAuthenticated && (
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-ink shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/20 p-2 text-primary shrink-0">
                  <Icon name="alert-triangle" className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-ink">Authentication Required in Production</div>
                  <div className="text-xs text-muted">
                    Sign in with your account, launch instant demo mode, or provide an API key.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="flex-1 sm:flex-initial rounded-lg border border-primary text-primary hover:bg-primary/20 px-3.5 py-2 text-xs font-semibold transition-colors text-center"
                >
                  🚀 Demo Login
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="flex-1 sm:flex-initial rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow hover:bg-primary-hover transition-colors text-center"
                >
                  Sign In / Register
                </button>
              </div>
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
