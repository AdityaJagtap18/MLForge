import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { AuthModal } from "../auth/AuthModal";
import { Icon } from "../ui/Icon";
import logoMark from "../../assets/mlforge-mark.svg";

interface UserInfo {
  id?: string;
  email?: string;
  is_demo?: boolean;
}

export interface HeaderProps {
  onOpenMenu?: () => void;
  onDemoLogin?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "warning" | "success" | "info";
  link: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Drift Monitoring Baseline",
    description: "Drift monitoring engine active across model deployments.",
    time: "5m ago",
    type: "warning",
    link: "/monitoring",
    read: false,
  },
  {
    id: "notif-2",
    title: "AutoML Evaluator Ready",
    description: "Automated candidate search and hyperparameter ranking operational.",
    time: "20m ago",
    type: "success",
    link: "/experiments",
    read: false,
  },
  {
    id: "notif-3",
    title: "Model Governance",
    description: "Registry staging quality gates and lifecycle enforcement online.",
    time: "1h ago",
    type: "info",
    link: "/registry",
    read: false,
  },
  {
    id: "notif-4",
    title: "Demo Mode Active",
    description: "Full access to datasets, training pipelines, and metrics enabled.",
    time: "Just now",
    type: "info",
    link: "/datasets",
    read: false,
  },
];

export function Header({ onOpenMenu, onDemoLogin }: HeaderProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isAuthenticated = Boolean(user || localStorage.getItem("mlforge_token") || hasApiKey);
  const isDemo = Boolean(user?.is_demo || user?.email === "demo@mlforge.ai");
  const unreadCount = notifications.filter((n) => !n.read).length;

  const displayName = user?.email
    ? isDemo
      ? "Demo User"
      : user.email.split("@")[0]
    : hasApiKey
    ? "System Admin"
    : "Anonymous";

  const initials = isDemo
    ? "DU"
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : hasApiKey
    ? "SA"
    : "G";

  async function handleDemoDirect() {
    if (onDemoLogin) {
      onDemoLogin();
      return;
    }
    setIsDemoLoading(true);
    try {
      await api.loginDemo();
      syncAuth();
      window.location.reload();
    } finally {
      setIsDemoLoading(false);
    }
  }

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

  function handleNotificationClick(item: NotificationItem) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    setShowNotifications(false);
    navigate(item.link);
  }

  function handleMarkAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleDismissNotification(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleClearAllNotifications() {
    setNotifications([]);
  }

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger menu toggle */}
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open navigation menu"
              className="inline-flex lg:hidden items-center justify-center rounded-lg p-2 text-ink hover:bg-bg focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
          )}

          {/* Mobile brand mark */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src={logoMark} alt="MLForge" className="h-6 w-auto" />
            <span className="font-bold text-sm text-ink tracking-tight">MLForge</span>
          </div>

          {/* Search bar: hidden on narrow screens to prevent blowout, expands on md+ */}
          <div className="hidden md:flex w-64 lg:w-[380px] xl:w-[420px] items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
            <Icon name="search" className="h-4 w-4 text-muted" />
            <input
              className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
              placeholder="Search datasets, experiments, models..."
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">⌘K</kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Notifications Button & Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowUserMenu(false);
              }}
              aria-label="Notifications"
              className="relative rounded-lg p-2 text-ink hover:bg-bg transition-colors focus:outline-none"
            >
              <Icon name="bell" className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Panel Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-32px)] sm:w-[380px] max-w-sm rounded-2xl border border-line bg-surface shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-bg/40">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notification List */}
                <div className="max-h-[360px] overflow-y-auto divide-y divide-line/60">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-muted">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg text-muted mb-2">
                        <Icon name="check-circle" className="h-5 w-5 text-green-600" />
                      </div>
                      <p className="text-sm font-medium text-ink">All caught up!</p>
                      <p className="text-xs text-muted mt-0.5">No active alerts or job notifications.</p>
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`group relative flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-bg ${
                          !item.read ? "bg-primary/5 font-medium" : ""
                        }`}
                      >
                        {/* Status Icon */}
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            item.type === "warning"
                              ? "bg-amber/15 text-amber"
                              : item.type === "success"
                              ? "bg-green-100 text-green-700"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          <Icon
                            name={
                              item.type === "warning"
                                ? "alert-triangle"
                                : item.type === "success"
                                ? "check-circle"
                                : "experiments"
                            }
                            className="h-4 w-4"
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-ink truncate">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-muted whitespace-nowrap">
                              {item.time}
                            </span>
                          </div>
                          <p className="text-xs text-muted leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        {/* Dismiss button */}
                        <button
                          type="button"
                          onClick={(e) => handleDismissNotification(e, item.id)}
                          className="absolute top-2 right-2 rounded p-1 text-muted/60 opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-ink transition-opacity"
                          title="Dismiss"
                        >
                          <Icon name="close" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="border-t border-line px-4 py-2.5 bg-bg/40 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleClearAllNotifications}
                      className="text-xs text-muted hover:text-ink"
                    >
                      Clear all
                    </button>
                    <span className="text-[11px] text-muted">
                      Click an alert to view telemetry
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 rounded-lg p-1 hover:bg-bg transition-colors"
              >
                <div
                  className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-xs sm:text-sm font-semibold text-white shadow-xs ${
                    isDemo ? "bg-amber" : "bg-primary"
                  }`}
                >
                  {initials}
                </div>
                <div className="hidden sm:block text-left text-sm leading-tight">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <span>{displayName}</span>
                    {isDemo && (
                      <span className="rounded bg-amber/20 border border-amber/40 px-1 py-0.2 text-[10px] font-bold text-amber">
                        DEMO
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {isDemo
                      ? "Interactive Sandbox"
                      : hasApiKey && !user
                      ? "API Key Mode"
                      : "Authenticated"}
                  </div>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-xl z-50">
                  <div className="px-3 py-2 text-xs text-muted border-b border-line mb-1">
                    <div className="font-semibold text-ink">{displayName}</div>
                    <div className="truncate">{user?.email || "Signed in with API Key"}</div>
                    {isDemo && (
                      <div className="mt-1 text-[11px] text-amber font-medium">
                        ✦ Demo Mode Active
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowAuthModal(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm text-ink hover:bg-bg"
                  >
                    Switch Account / API Key
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm text-red-700 hover:bg-red-50"
                  >
                    {isDemo ? "Exit Demo Mode" : "Sign Out"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Quick Demo Mode button */}
              <button
                type="button"
                onClick={handleDemoDirect}
                disabled={isDemoLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                title="Directly explore without registration"
              >
                <span>🚀</span>
                <span className="whitespace-nowrap">
                  {isDemoLoading ? "Starting..." : "Demo Login"}
                </span>
              </button>

              {/* Standard Sign In / Register */}
              <button
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white shadow hover:bg-primary-hover transition-colors"
              >
                <span className="whitespace-nowrap">Sign In</span>
              </button>
            </div>
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
