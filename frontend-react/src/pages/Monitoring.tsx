import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  ApiError,
  type DeploymentResponse,
  type ModelVersion,
  type MonitoringSnapshotResponse,
  type RetrainingCandidate,
} from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return iso;
  }
}

export function Monitoring() {
  const navigate = useNavigate();

  // Core Data
  const [deployments, setDeployments] = useState<DeploymentResponse[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [snapshots, setSnapshots] = useState<MonitoringSnapshotResponse[]>([]);
  const [candidates, setCandidates] = useState<RetrainingCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "alert" | "clean" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Run Monitoring Modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runDeployId, setRunDeployId] = useState<string>("");
  const [windowFile, setWindowFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [latestRunResult, setLatestRunResult] = useState<MonitoringSnapshotResponse | null>(null);

  // Snapshot Inspection Modal
  const [inspectSnapshot, setInspectSnapshot] = useState<MonitoringSnapshotResponse | null>(null);
  const [generateCandidateBusy, setGenerateCandidateBusy] = useState(false);
  const [candidateActionMessage, setCandidateActionMessage] = useState<string | null>(null);
  const [candidateActionError, setCandidateActionError] = useState<string | null>(null);

  // Mapping helpers
  const deploymentMap = useMemo(() => {
    const map = new Map<string, DeploymentResponse>();
    deployments.forEach((d) => map.set(d.id, d));
    return map;
  }, [deployments]);

  const versionMap = useMemo(() => {
    const map = new Map<string, ModelVersion>();
    versions.forEach((v) => map.set(v.id, v));
    return map;
  }, [versions]);

  // Load all data
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [allDeployments, allVersions, allCandidates] = await Promise.all([
        api.listDeployments(),
        api.listRegistryVersions(),
        api.listRetrainingCandidates().catch(() => [] as RetrainingCandidate[]),
      ]);
      setDeployments(allDeployments);
      setVersions(allVersions);
      setCandidates(allCandidates);

      // Fetch monitoring snapshots for all deployments
      const snapshotPromises = allDeployments.map(async (d) => {
        try {
          return await api.listMonitoringSnapshots(d.id);
        } catch {
          return [] as MonitoringSnapshotResponse[];
        }
      });

      const snapshotArrays = await Promise.all(snapshotPromises);
      const flattened = snapshotArrays.flat();
      flattened.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSnapshots(flattened);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load monitoring data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Compute Overview KPIs
  const kpis = useMemo(() => {
    const total = snapshots.length;
    const alertable = snapshots.filter((s) => s.alert).length;
    const clean = snapshots.filter((s) => s.status === "ok" && !s.drift_detected && !s.alert).length;
    const failed = snapshots.filter((s) => s.status !== "ok").length;
    const monitoredDeployments = new Set(snapshots.map((s) => s.deployment_id)).size;
    const alertRate = total > 0 ? ((alertable / total) * 100).toFixed(1) : "0.0";
    const latestSnapshot = snapshots[0] || null;

    return {
      total,
      alertable,
      clean,
      failed,
      monitoredDeployments,
      alertRate,
      latestSnapshot,
    };
  }, [snapshots]);

  // Filtered Snapshots
  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((s) => {
      // Deployment filter
      if (selectedDeploymentId !== "all" && s.deployment_id !== selectedDeploymentId) {
        return false;
      }
      // Status filter
      if (statusFilter === "alert" && !s.alert) return false;
      if (statusFilter === "clean" && (s.alert || s.status !== "ok")) return false;
      if (statusFilter === "error" && s.status === "ok") return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const deploy = deploymentMap.get(s.deployment_id);
        const matchId = s.id.toLowerCase().includes(q);
        const matchDeploy = s.deployment_id.toLowerCase().includes(q);
        const matchModel = deploy ? deploy.model_name.toLowerCase().includes(q) : false;
        const matchErr = s.error_message ? s.error_message.toLowerCase().includes(q) : false;
        if (!matchId && !matchDeploy && !matchModel && !matchErr) {
          return false;
        }
      }

      return true;
    });
  }, [snapshots, selectedDeploymentId, statusFilter, searchQuery, deploymentMap]);

  // Candidate lookup helper
  function findCandidateForSnapshot(snapshotId: string): RetrainingCandidate | undefined {
    return candidates.find((c) => c.monitoring_snapshot_id === snapshotId);
  }

  // Handle Run Monitoring
  async function handleRunMonitoring(e: React.FormEvent) {
    e.preventDefault();
    if (!runDeployId) {
      setRunError("Please select a target deployment.");
      return;
    }
    if (!windowFile) {
      setRunError("Please select a CSV file containing the inference window.");
      return;
    }

    setRunBusy(true);
    setRunError(null);
    setLatestRunResult(null);

    try {
      const formData = new FormData();
      formData.append("file", windowFile);

      const result = await api.runMonitoring(runDeployId, formData);
      setLatestRunResult(result);
      setSuccessBanner(`Evaluation complete for deployment ${runDeployId.slice(0, 8)}.`);
      // Reload snapshots & candidates
      await loadData();
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Drift evaluation failed.");
    } finally {
      setRunBusy(false);
    }
  }

  // Handle Candidate Generation
  async function handleGenerateCandidate(snapshotId: string) {
    setGenerateCandidateBusy(true);
    setCandidateActionMessage(null);
    setCandidateActionError(null);

    try {
      const candidate = await api.generateCandidateFromSnapshot(snapshotId);
      setCandidateActionMessage(
        `Retraining candidate ${candidate.id.slice(0, 8)} successfully generated from drift snapshot!`
      );
      // Reload candidates
      const updatedCandidates = await api.listRetrainingCandidates();
      setCandidates(updatedCandidates);
    } catch (err) {
      setCandidateActionError(
        err instanceof ApiError ? err.message : "Failed to generate retraining candidate from snapshot."
      );
    } finally {
      setGenerateCandidateBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Icon name="monitoring" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Monitoring & Drift Intelligence</h1>
              <p className="text-sm text-slate-400">
                Evidently-powered data drift evaluation, inference window tracking, and automated retraining pipelines
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh monitoring data"
          >
            <Icon name="clock" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setRunDeployId(deployments.find((d) => d.status === "active")?.id || deployments[0]?.id || "");
              setWindowFile(null);
              setRunError(null);
              setLatestRunResult(null);
              setShowRunModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
          >
            <Icon name="upload" className="w-4 h-4" />
            Evaluate Drift Window
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successBanner && (
        <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="w-5 h-5 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-emerald-300 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Snapshots */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Evaluations</span>
            <Icon name="database" className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">{kpis.total}</span>
            <span className="text-xs text-slate-500">snapshots</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Recorded inference windows</p>
        </div>

        {/* Alertable Drift Events */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Alertable Drift</span>
            <div className={`p-1 rounded ${kpis.alertable > 0 ? "bg-red-500/10 text-red-400" : "bg-slate-800 text-slate-500"}`}>
              <Icon name="alert-triangle" className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${kpis.alertable > 0 ? "text-red-400" : "text-slate-100"}`}>
              {kpis.alertable}
            </span>
            <span className="text-xs text-slate-500">events</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Trigger threshold exceeded</p>
        </div>

        {/* Stable / Clean Windows */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Stable / Clean</span>
            <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
              <Icon name="check-circle" className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{kpis.clean}</span>
            <span className="text-xs text-slate-500">windows</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">No significant drift detected</p>
        </div>

        {/* Active Monitored Deployments */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Monitored Slots</span>
            <Icon name="deployment" className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">{kpis.monitoredDeployments}</span>
            <span className="text-xs text-slate-500">/ {deployments.length} total</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Deployments with history</p>
        </div>

        {/* Drift Alert Rate */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Drift Alert Rate</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
              Rule: $\ge$50%
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${Number(kpis.alertRate) > 30 ? "text-amber-400" : "text-slate-100"}`}>
              {kpis.alertRate}%
            </span>
            <span className="text-xs text-slate-500">of snapshots</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Alert threshold ratio</p>
        </div>
      </div>

      {/* Retraining Lineage Explainer Card */}
      <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Icon name="pipelines" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Controlled Automation Retraining Architecture</h3>
              <p className="text-xs text-slate-400">
                Drift signals surface recommendations; retraining candidates require champion evaluation and human sign-off before promotion.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 overflow-x-auto py-1">
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-300">1. Drift Snapshot</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-300">2. Candidate Generation</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-300">3. Champion Gate</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-300">4. Human Approval</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-emerald-400">5. Promotion</span>
          </div>
        </div>
      </div>

      {/* Snapshot History Section */}
      <Card>
        <CardHeader
          title="Drift Evaluation History"
          subtitle="Historical inference window evaluations, Evidently dataset drift verdicts, and candidate lineage"
        />

        {/* Filter & Search Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === "all"
                  ? "bg-primary text-white"
                  : "bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200"
              }`}
            >
              All ({snapshots.length})
            </button>
            <button
              onClick={() => setStatusFilter("alert")}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === "alert"
                  ? "bg-red-500 text-white"
                  : "bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-red-400"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Alertable ({kpis.alertable})
            </button>
            <button
              onClick={() => setStatusFilter("clean")}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === "clean"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-emerald-400"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Stable / Clean ({kpis.clean})
            </button>
            {kpis.failed > 0 && (
              <button
                onClick={() => setStatusFilter("error")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === "error"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200"
                }`}
              >
                Error ({kpis.failed})
              </button>
            )}
          </div>

          {/* Right Toolbar Controls: Deployment Select + Search */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Deployment Filter Dropdown */}
            <select
              value={selectedDeploymentId}
              onChange={(e) => setSelectedDeploymentId(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-primary"
            >
              <option value="all">All Deployments</option>
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.model_name} ({d.id.slice(0, 8)}) - {d.status}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Icon name="search" className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search snapshots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Snapshots Table */}
        <div className="overflow-x-auto">
          {loading && snapshots.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
              <p className="text-sm">Loading monitoring snapshots and deployments...</p>
            </div>
          ) : filteredSnapshots.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Icon name="monitoring" className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-base font-semibold text-slate-300">No monitoring snapshots found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {snapshots.length === 0
                  ? "No drift evaluation windows have been uploaded yet. Upload an inference window CSV to evaluate drift against a deployment's training data."
                  : "No snapshots match the selected filter criteria."}
              </p>
              {snapshots.length === 0 && (
                <button
                  onClick={() => {
                    setRunDeployId(deployments[0]?.id || "");
                    setShowRunModal(true);
                  }}
                  className="mt-4 px-4 py-2 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                >
                  Evaluate First Window
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Snapshot ID</th>
                  <th className="py-3 px-4">Deployment / Model</th>
                  <th className="py-3 px-4">Drift Status</th>
                  <th className="py-3 px-4">Drift Share</th>
                  <th className="py-3 px-4">Window Rows</th>
                  <th className="py-3 px-4">Evaluated</th>
                  <th className="py-3 px-4">Retraining Pipeline</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredSnapshots.map((snapshot) => {
                  const deployment = deploymentMap.get(snapshot.deployment_id);
                  const version = deployment ? versionMap.get(deployment.model_version_id) : undefined;
                  const candidate = findCandidateForSnapshot(snapshot.id);
                  const driftPct =
                    snapshot.drift_share !== null ? Math.round(snapshot.drift_share * 100) : null;

                  return (
                    <tr
                      key={snapshot.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => {
                        setCandidateActionMessage(null);
                        setCandidateActionError(null);
                        setInspectSnapshot(snapshot);
                      }}
                    >
                      {/* Snapshot ID */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 group-hover:text-primary transition-colors">
                          {snapshot.id.slice(0, 8)}
                        </span>
                      </td>

                      {/* Deployment / Model */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200 flex items-center gap-1.5">
                          <span>{deployment ? deployment.model_name : "Unknown Model"}</span>
                          {version && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                              v{version.version}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                          <span>deploy: {snapshot.deployment_id.slice(0, 8)}</span>
                          {deployment && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400">
                              {deployment.status}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Drift Status */}
                      <td className="py-3 px-4">
                        {snapshot.status !== "ok" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            {snapshot.status}
                          </span>
                        ) : snapshot.alert ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                            Alertable Drift
                          </span>
                        ) : snapshot.drift_detected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Drift Detected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Icon name="check-circle" className="w-3 h-3" />
                            Stable / Clean
                          </span>
                        )}
                      </td>

                      {/* Drift Share */}
                      <td className="py-3 px-4">
                        {driftPct !== null ? (
                          <div className="space-y-1 w-28">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-semibold text-slate-200">{driftPct}%</span>
                              <span className="text-slate-500 text-[10px]">
                                {snapshot.drift_detected ? "drifted" : "stable"}
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${
                                  snapshot.alert
                                    ? "bg-red-500"
                                    : driftPct > 0
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(driftPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Window Rows */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {snapshot.n_rows.toLocaleString()}
                      </td>

                      {/* Evaluated At */}
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{formatDate(snapshot.created_at)}</div>
                        <div className="text-[11px] text-slate-500">
                          {formatRelativeTime(snapshot.created_at)}
                        </div>
                      </td>

                      {/* Retraining Pipeline */}
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {candidate ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                candidate.status === "approved"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : candidate.status === "rejected" || candidate.status === "promotion_failed"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : candidate.status === "evaluated"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {candidate.status}
                            </span>
                            <button
                              onClick={() => navigate("/pipelines")}
                              className="text-[11px] text-primary hover:text-primary/80 font-medium underline"
                              title="Navigate to retraining pipeline"
                            >
                              Pipelines &rarr;
                            </button>
                          </div>
                        ) : snapshot.alert ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleGenerateCandidate(snapshot.id);
                            }}
                            disabled={generateCandidateBusy}
                            className="px-2.5 py-1 text-[11px] font-medium bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 rounded transition-colors"
                            title="Generate retraining candidate from this alertable drift snapshot"
                          >
                            Generate Candidate
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px]" title="Drift below 50% alert threshold">
                            Below Threshold
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setCandidateActionMessage(null);
                            setCandidateActionError(null);
                            setInspectSnapshot(snapshot);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* MODAL 1: Run Monitoring / Upload Inference Window */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Icon name="upload" className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-slate-100">Evaluate Drift Window</h2>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleRunMonitoring} className="p-6 space-y-5 overflow-y-auto">
              {runError && (
                <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                  {runError}
                </div>
              )}

              {/* Target Deployment Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Target Deployment Slot <span className="text-red-400">*</span>
                </label>
                <select
                  value={runDeployId}
                  onChange={(e) => setRunDeployId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-primary"
                  required
                >
                  <option value="" disabled>
                    Select an active deployment
                  </option>
                  {deployments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.model_name} (ID: {d.id.slice(0, 8)}) — Status: {d.status}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Evidently evaluates drift between the deployed model's original training dataset and the uploaded window.
                </p>
              </div>

              {/* CSV Upload Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Inference Window CSV File <span className="text-red-400">*</span>
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = e.dataTransfer.files[0];
                    if (dropped && dropped.name.endsWith(".csv")) {
                      setWindowFile(dropped);
                    } else {
                      setRunError("Please provide a valid .csv file.");
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : windowFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-slate-700 hover:border-slate-600 bg-slate-800/40"
                  }`}
                  onClick={() => document.getElementById("monitoring-file-input")?.click()}
                >
                  <input
                    id="monitoring-file-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setWindowFile(e.target.files[0]);
                    }}
                  />
                  {windowFile ? (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Icon name="check-circle" className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">{windowFile.name}</p>
                      <p className="text-xs text-slate-400">
                        {(windowFile.size / 1024).toFixed(1)} KB &bull; Click or drop another file to replace
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 text-slate-400 flex items-center justify-center">
                        <Icon name="upload" className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">
                        Drag & drop your inference window CSV here
                      </p>
                      <p className="text-xs text-slate-400">or click to browse from local drive</p>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Requirements: Must be a CSV containing columns matching the deployed model's input feature set.
                </p>
              </div>

              {/* Evaluation Outcome if executed in-modal */}
              {latestRunResult && (
                <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 uppercase">Evaluation Result</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        latestRunResult.alert
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {latestRunResult.alert ? "Alertable Drift Triggered" : "Stable / Non-Alerting"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-900 rounded">
                      <span className="text-slate-400 block">Drift Share</span>
                      <span className="text-sm font-bold text-slate-200">
                        {latestRunResult.drift_share !== null
                          ? `${Math.round(latestRunResult.drift_share * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded">
                      <span className="text-slate-400 block">Dataset Drift</span>
                      <span className="text-sm font-bold text-slate-200">
                        {latestRunResult.drift_detected ? "Detected" : "Clean"}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded">
                      <span className="text-slate-400 block">Window Rows</span>
                      <span className="text-sm font-bold text-slate-200">{latestRunResult.n_rows}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRunModal(false);
                        setInspectSnapshot(latestRunResult);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Inspect Details &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={runBusy || !windowFile || !runDeployId}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {runBusy ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                      Computing Drift with Evidently...
                    </>
                  ) : (
                    <>
                      <Icon name="monitoring" className="w-4 h-4" />
                      Run Drift Evaluation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Detailed Snapshot Inspection & Retraining Lineage */}
      {inspectSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Icon name="monitoring" className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Snapshot Inspection</h2>
                  <p className="text-xs text-slate-400 font-mono">ID: {inspectSnapshot.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectSnapshot(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Feedback banners */}
              {candidateActionMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                  <Icon name="check-circle" className="w-4 h-4 flex-shrink-0" />
                  <span>{candidateActionMessage}</span>
                </div>
              )}
              {candidateActionError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                  <Icon name="alert-triangle" className="w-4 h-4 flex-shrink-0" />
                  <span>{candidateActionError}</span>
                </div>
              )}

              {/* Snapshot Core Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Dataset Drift
                  </span>
                  <span className="text-base font-bold text-slate-100 mt-1 block">
                    {inspectSnapshot.drift_detected ? "Detected" : "Clean"}
                  </span>
                  <span className="text-[10px] text-slate-500">Evidently verdict</span>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Drift Share
                  </span>
                  <span className="text-base font-bold text-slate-100 mt-1 block">
                    {inspectSnapshot.drift_share !== null
                      ? `${Math.round(inspectSnapshot.drift_share * 100)}%`
                      : "N/A"}
                  </span>
                  <span className="text-[10px] text-slate-500">Features drifted</span>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Window Rows
                  </span>
                  <span className="text-base font-bold text-slate-100 mt-1 block">
                    {inspectSnapshot.n_rows.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">Inference samples</span>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Alert Status
                  </span>
                  <span
                    className={`text-base font-bold mt-1 block ${
                      inspectSnapshot.alert ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {inspectSnapshot.alert ? "Triggered" : "Normal"}
                  </span>
                  <span className="text-[10px] text-slate-500">Threshold: $\ge$50%</span>
                </div>
              </div>

              {/* Target Deployment & Timestamp Info */}
              <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Target Deployment:</span>
                  <span className="font-mono text-slate-200">
                    {deploymentMap.get(inspectSnapshot.deployment_id)?.model_name || "Unknown"}{" "}
                    {deploymentMap.get(inspectSnapshot.deployment_id)?.model_version_id &&
                      versionMap.get(deploymentMap.get(inspectSnapshot.deployment_id)!.model_version_id) && (
                        <span className="text-primary font-mono text-[11px]">
                          v{versionMap.get(deploymentMap.get(inspectSnapshot.deployment_id)!.model_version_id)!.version}
                        </span>
                      )}{" "}
                    ({inspectSnapshot.deployment_id.slice(0, 8)})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Drift Type:</span>
                  <span className="text-slate-200 font-mono">{inspectSnapshot.drift_type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Evaluated At:</span>
                  <span className="text-slate-200">{formatDate(inspectSnapshot.created_at)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-slate-200 uppercase font-mono">{inspectSnapshot.status}</span>
                </div>
                {inspectSnapshot.error_message && (
                  <div className="pt-2 text-red-400 border-t border-slate-700/60">
                    <strong>Error:</strong> {inspectSnapshot.error_message}
                  </div>
                )}
              </div>

              {/* Feature-Level Drift Analysis Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Feature-Level Drift Analysis</h3>
                  <span className="text-[11px] text-slate-500">Evidently Adapter</span>
                </div>

                {inspectSnapshot.report && inspectSnapshot.report.drift_by_columns ? (
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Column</th>
                          <th className="py-2 px-3">Drift Detected</th>
                          <th className="py-2 px-3">Score / p-value</th>
                          <th className="py-2 px-3">Stat Test</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {Object.entries(
                          inspectSnapshot.report.drift_by_columns as Record<
                            string,
                            { drift_detected: boolean; drift_score: number; stat_test?: string }
                          >
                        ).map(([col, data]) => (
                          <tr key={col} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 font-mono text-slate-200">{col}</td>
                            <td className="py-2 px-3">
                              {data.drift_detected ? (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-semibold">
                                  Drift
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400">
                                  Stable
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300">
                              {typeof data.drift_score === "number" ? data.drift_score.toFixed(4) : "—"}
                            </td>
                            <td className="py-2 px-3 text-slate-400">{data.stat_test || "Wasserstein / KS"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-800/30 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                      <Icon name="chart" className="w-4 h-4 text-primary" />
                      <span>Architecture Note: Dataset-Level Drift vs. Feature Distributions</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Evidently AI statistical tests (Wasserstein distance for continuous features, KS test for categorical)
                      and per-column distribution histograms are evaluated and persisted in PostgreSQL (
                      <code className="text-slate-300 font-mono">monitoring_snapshots.report</code> JSON column).
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      The REST API contract (<code className="text-slate-300 font-mono">MonitoringSnapshotResponse</code>)
                      exposes aggregate indicators (<code className="text-slate-300 font-mono">drift_detected</code>,{" "}
                      <code className="text-slate-300 font-mono">drift_share</code>,{" "}
                      <code className="text-slate-300 font-mono">alert</code>).
                    </p>
                  </div>
                )}
              </div>

              {/* Drift-to-Retraining Lineage & Actions */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="pipelines" className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Drift-to-Retraining Lineage
                    </h3>
                  </div>
                  {findCandidateForSnapshot(inspectSnapshot.id) && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Candidate Exists
                    </span>
                  )}
                </div>

                {(() => {
                  const candidate = findCandidateForSnapshot(inspectSnapshot.id);

                  if (candidate) {
                    return (
                      <div className="space-y-3">
                        <div className="p-3 bg-slate-900 rounded-lg text-xs space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Candidate ID:</span>
                            <span className="font-mono text-slate-200">{candidate.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Lifecycle Status:</span>
                            <span className="font-semibold text-primary uppercase">{candidate.status}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Trigger Source:</span>
                            <span className="text-slate-200 font-mono">{candidate.source}</span>
                          </div>
                          {candidate.evaluation && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Gate Passed:</span>
                              <span
                                className={`font-semibold ${
                                  candidate.evaluation.passed ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {candidate.evaluation.passed ? "Yes" : "No"} (
                                {candidate.evaluation.candidate_score !== null
                                  ? candidate.evaluation.candidate_score.toFixed(3)
                                  : "—"}
                                )
                              </span>
                            </div>
                          )}
                          {candidate.decision && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Human Sign-off:</span>
                              <span className="font-medium text-slate-200 uppercase">
                                {candidate.decision} by {candidate.decided_by || "user"}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setInspectSnapshot(null);
                              navigate("/pipelines");
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                          >
                            <Icon name="pipelines" className="w-3.5 h-3.5" />
                            Open in Retraining Pipelines &rarr;
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (inspectSnapshot.alert) {
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-300">
                          This snapshot flagged significant data drift ({Math.round((inspectSnapshot.drift_share || 0) * 100)}% feature drift).
                          You can generate a controlled retraining candidate using the original dataset configuration.
                        </p>
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleGenerateCandidate(inspectSnapshot.id)}
                            disabled={generateCandidateBusy}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                          >
                            {generateCandidateBusy ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                                Generating Candidate...
                              </>
                            ) : (
                              <>
                                <Icon name="pipelines" className="w-3.5 h-3.5" />
                                Generate Retraining Candidate
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 bg-slate-900/60 rounded-lg text-xs text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">Retraining candidate generation gated</p>
                      <p>
                        This snapshot is below the alert threshold (requires Evidently dataset drift verdict or $\ge$50% drifted features).
                        Automated candidate generation from snapshot is reserved for alertable drift events.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  onClick={() => setInspectSnapshot(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
