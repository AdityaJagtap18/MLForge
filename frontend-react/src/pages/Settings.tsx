import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import {
  ApiError,
  type SettingsResponse,
} from "../api/types";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

function formatTimestamp(isoStr: string | null | undefined): string {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export function Settings() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Category filter for capabilities
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Health probe re-checking state
  const [checkingHealth, setCheckingHealth] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSettings();
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load system settings and environment status.");
    } finally {
      setLoading(false);
    }
  }

  async function recheckHealth() {
    setCheckingHealth(true);
    try {
      const healthDetails = await api.getDependencyHealth();
      setData((prev) => (prev ? { ...prev, health: healthDetails } : null));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to re-check dependency health probes.");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutMessage(null);
    try {
      await api.logout().catch(() => ({ revoked: false }));
      localStorage.removeItem("mlforge_token");
      localStorage.removeItem("mlforge_user");
      setLogoutMessage("Session successfully terminated. Client authentication tokens cleared.");
      setShowLogoutConfirm(false);
      // Reload profile/settings to reflect logged-out or dev bypass state
      await loadSettings();
    } catch (err) {
      setLogoutMessage(err instanceof ApiError ? err.message : "Logout encountered an error, but local session state was cleared.");
      localStorage.removeItem("mlforge_token");
      setShowLogoutConfirm(false);
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  // Filtered Capabilities
  const categories = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.capabilities.forEach((c) => set.add(c.category));
    return ["all", ...Array.from(set)];
  }, [data]);

  const filteredCapabilities = useMemo(() => {
    if (!data) return [];
    if (selectedCategory === "all") return data.capabilities;
    return data.capabilities.filter((c) => c.category === selectedCategory);
  }, [data, selectedCategory]);

  // Overall Health Summary
  const overallHealth = useMemo(() => {
    if (!data || data.health.length === 0) return { status: "unknown", label: "Unknown" };
    const statuses = data.health.map((h) => h.status);
    if (statuses.some((s) => s === "unavailable")) {
      return { status: "unavailable", label: "Degraded: Unavailable Dependencies" };
    }
    if (statuses.some((s) => s === "degraded")) {
      return { status: "degraded", label: "Operational (Non-Critical Fallbacks Active)" };
    }
    return { status: "healthy", label: "All 5 Core Dependencies Operational" };
  }, [data]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <PageHeader
        title="Settings &amp; Environment"
        subtitle="Authoritative application configuration, runtime environment, system capabilities, and live dependency health diagnostics."
        badge={
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
            v0.4.0
          </span>
        }
        actions={
          <>
            {lastUpdated && <span className="text-xs text-muted">Last verified: {lastUpdated}</span>}
            <button
              type="button"
              onClick={loadSettings}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-xs disabled:opacity-50"
            >
              <Icon name="clock" className={`h-4 w-4 ${loading ? "animate-spin text-primary" : "text-muted"}`} />
              Refresh
            </button>
          </>
        }
      />

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadSettings}
            className="rounded border border-red-300 bg-surface px-3 py-1 font-semibold text-red-700 hover:bg-red-50 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Logout Notice Message */}
      {logoutMessage && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span>{logoutMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setLogoutMessage(null)}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Initial Loading Skeletons */}
      {loading && !data ? (
        <div className="space-y-6">
          <div className="h-44 rounded-card border border-line bg-surface p-6 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-card border border-line bg-surface p-5 animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-card border border-line bg-surface p-6 animate-pulse" />
        </div>
      ) : data ? (
        <>
          {/* SECTION 1: Authenticated User Profile & Session */}
          <Card>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              {/* User Identity Column */}
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-lg font-bold border border-primary/20">
                  {data.profile.email ? data.profile.email[0].toUpperCase() : "U"}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink">
                      {data.profile.email || "Local Development User"}
                    </h2>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {data.profile.role}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        data.profile.auth_status === "authenticated"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber/15 text-amber"
                      }`}
                    >
                      {data.profile.auth_status === "authenticated"
                        ? "Active Bearer Session"
                        : "Development Bypass Active"}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted">
                    User ID: {data.profile.user_id}
                  </p>
                </div>
              </div>

              {/* Session Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border-t lg:border-t-0 lg:border-l border-line pt-4 lg:pt-0 lg:pl-6">
                <div>
                  <span className="text-muted block text-[11px]">Authentication Mode</span>
                  <span className="font-medium text-ink mt-0.5 block">
                    {data.profile.is_service_account ? "Service Account (API Key)" : "Opaque Bearer Token"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Session Created</span>
                  <span className="font-medium text-ink mt-0.5 block">
                    {formatTimestamp(data.profile.session_created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Session Expiration</span>
                  <span className="font-medium text-ink mt-0.5 block">
                    {formatTimestamp(data.profile.session_expires_at)}
                  </span>
                </div>
              </div>

              {/* Logout Action */}
              <div className="flex lg:flex-col justify-end pt-2 lg:pt-0">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  disabled={loggingOut}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors shadow-xs disabled:opacity-50"
                >
                  <Icon name="alert-triangle" className="h-3.5 w-3.5 text-red-600" />
                  Terminate Session
                </button>
              </div>
            </div>
          </Card>

          {/* SECTION 2: Application Configuration & Runtime Environment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
                Application Configuration &amp; Runtime
              </h2>
              <span className="rounded bg-line px-2 py-0.5 text-[11px] font-mono text-muted">
                Allowlisted Configuration Only
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* App Info */}
              <Card>
                <div className="text-xs text-muted">Application &amp; Version</div>
                <div className="mt-1 text-base font-bold text-ink">
                  {data.config.app_name}
                </div>
                <div className="mt-1 text-xs text-muted flex items-center gap-1.5">
                  <span className="font-mono font-medium text-primary">v{data.config.app_version}</span>
                  <span>·</span>
                  <span>API {data.config.api_version}</span>
                </div>
              </Card>

              {/* Environment */}
              <Card>
                <div className="text-xs text-muted">Runtime Environment</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-base font-bold text-ink capitalize">
                    {data.config.environment}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      data.config.is_production
                        ? "bg-red-100 text-red-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {data.config.is_production ? "Strict Production" : "Local Dev"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted truncate" title={data.config.deployment_mode}>
                  {data.config.deployment_mode}
                </div>
              </Card>

              {/* Endpoints */}
              <Card>
                <div className="text-xs text-muted">API Surface &amp; Endpoints</div>
                <div className="mt-1 text-xs font-mono font-semibold text-ink truncate" title={data.config.backend_base_url}>
                  {data.config.backend_base_url}
                </div>
                <div className="mt-1 text-[11px] text-muted flex items-center gap-2">
                  <a
                    href={`${data.config.backend_base_url}${data.config.docs_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    OpenAPI Docs <Icon name="arrow-right" className="h-3 w-3" />
                  </a>
                  <span>·</span>
                  <a
                    href={`${data.config.backend_base_url}/metrics`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted hover:text-ink hover:underline font-mono"
                  >
                    /metrics
                  </a>
                </div>
              </Card>

              {/* Startup & Uptime */}
              <Card>
                <div className="text-xs text-muted">Process Startup Timestamp</div>
                <div className="mt-1 text-xs font-medium text-ink">
                  {formatTimestamp(data.config.startup_time)}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  Continuous uptime telemetry active
                </div>
              </Card>
            </div>
          </div>

          {/* SECTION 3: Live Dependency Health Checks */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
                  Live Dependency Health Diagnostics
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    overallHealth.status === "healthy"
                      ? "bg-green-100 text-green-800"
                      : overallHealth.status === "degraded"
                      ? "bg-amber/15 text-amber"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {overallHealth.label}
                </span>
              </div>
              <button
                type="button"
                onClick={recheckHealth}
                disabled={checkingHealth}
                className="self-start sm:self-auto flex items-center gap-1.5 rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-bg transition-colors disabled:opacity-50"
              >
                <Icon name="clock" className={`h-3 w-3 ${checkingHealth ? "animate-spin text-primary" : "text-muted"}`} />
                Re-check Probes
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.health.map((probe) => {
                const isHealthy = probe.status === "healthy";
                const isDegraded = probe.status === "degraded";

                return (
                  <Card key={probe.key} className="flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              isHealthy
                                ? "bg-green-500"
                                : isDegraded
                                ? "bg-amber"
                                : "bg-red-500"
                            }`}
                          />
                          <h3 className="text-xs font-bold text-ink">{probe.name}</h3>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            isHealthy
                              ? "bg-green-100 text-green-800"
                              : isDegraded
                              ? "bg-amber/20 text-amber"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {probe.status}
                        </span>
                      </div>

                      <p className="text-xs text-muted leading-relaxed mb-3">
                        {probe.message}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-muted">
                      <span>
                        Latency:{" "}
                        <strong className="font-mono text-ink">
                          {probe.latency_ms !== null ? `${probe.latency_ms} ms` : "N/A"}
                        </strong>
                      </span>
                      {probe.version && (
                        <span className="font-mono rounded bg-line/60 px-1.5 py-0.5 text-[10px] text-muted">
                          {probe.version}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: System Capabilities & Feature Flags */}
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 mb-4">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  System Capabilities &amp; Feature Flags
                </h3>
                <p className="text-xs text-muted">
                  Operational capabilities verified against installed libraries and backend integrations
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      selectedCategory === cat
                        ? "bg-primary text-white"
                        : "border border-line bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Capabilities Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 px-3">Capability</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Operational State</th>
                    <th className="py-2.5 px-3">Functional Description</th>
                    <th className="py-2.5 px-3">Underlying Dependency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredCapabilities.map((cap) => (
                    <tr key={cap.key} className="hover:bg-bg/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-ink">
                        {cap.name}
                      </td>
                      <td className="py-3 px-3">
                        <span className="rounded bg-line px-2 py-0.5 text-[10px] font-medium text-muted">
                          {cap.category}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            cap.status === "available" || cap.status === "enabled"
                              ? "bg-green-100 text-green-800"
                              : cap.status === "degraded"
                              ? "bg-amber/15 text-amber"
                              : "bg-line text-muted"
                          }`}
                        >
                          {cap.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted max-w-md leading-relaxed">
                        {cap.description}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-muted">
                        {cap.dependency || "Built-in"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {/* Confirmation Modal for Session Termination / Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-600 flex-shrink-0">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ink">Terminate Active Session?</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Logging out will revoke your active bearer token on the server and clear your client-side authentication tokens.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loggingOut}
                className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loggingOut ? "Revoking..." : "Confirm Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
