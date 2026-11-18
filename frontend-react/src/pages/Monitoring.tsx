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
import { PageHeader } from "../components/layout/PageHeader";

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
      {/* Page Header */}
      <PageHeader
        title="Monitoring &amp; Drift Intelligence"
        subtitle="Evidently-powered data drift evaluation, inference window tracking, and automated retraining pipelines."
        actions={
          <>
            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-xs disabled:opacity-50"
              title="Refresh monitoring data"
            >
              <Icon name="clock" className={`h-4 w-4 ${loading ? "animate-spin text-primary" : "text-muted"}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setRunDeployId(deployments.find((d) => d.status === "active")?.id || deployments[0]?.id || "");
                setWindowFile(null);
                setRunError(null);
                setLatestRunResult(null);
                setShowRunModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
            >
              <Icon name="upload" className="h-4 w-4" />
              Evaluate Drift Window
            </button>
          </>
        }
      />

      {/* Global Alerts */}
      {successBanner && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 text-xs text-green-900">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="h-4 w-4 text-green-600 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-green-700 hover:text-green-900"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Snapshots */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Total Evaluations</span>
            <Icon name="datasets" className="h-4 w-4 text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink">{kpis.total}</span>
            <span className="text-xs text-muted">snapshots</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">Recorded inference windows</span>
        </Card>

        {/* Alertable Drift Events */}
        <Card
          className={`flex flex-col justify-between ${
            kpis.alertable > 0 ? "border-red-200/80 bg-red-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium uppercase flex items-center gap-1.5 ${
                kpis.alertable > 0 ? "text-red-700" : "text-muted"
              }`}
            >
              {kpis.alertable > 0 && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />}
              Alertable Drift
            </span>
            <div
              className={`rounded p-1 ${
                kpis.alertable > 0 ? "bg-red-100 text-red-700" : "bg-bg text-muted"
              }`}
            >
              <Icon name="alert-triangle" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold ${
                kpis.alertable > 0 ? "text-red-900" : "text-ink"
              }`}
            >
              {kpis.alertable}
            </span>
            <span className={`text-xs ${kpis.alertable > 0 ? "text-red-700" : "text-muted"}`}>
              events
            </span>
          </div>
          <span
            className={`mt-1 text-[11px] ${
              kpis.alertable > 0 ? "text-red-700" : "text-muted"
            }`}
          >
            Trigger threshold exceeded
          </span>
        </Card>

        {/* Stable / Clean Windows */}
        <Card className="flex flex-col justify-between border-green-200/80 bg-green-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-green-800 uppercase flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-600" />
              Stable / Clean
            </span>
            <div className="rounded bg-green-100 p-1 text-green-700">
              <Icon name="check-circle" className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-green-900">{kpis.clean}</span>
            <span className="text-xs text-green-700">windows</span>
          </div>
          <span className="mt-1 text-[11px] text-green-700">No significant drift detected</span>
        </Card>

        {/* Monitored Slots */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Monitored Slots</span>
            <Icon name="deployment" className="h-4 w-4 text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink">{kpis.monitoredDeployments}</span>
            <span className="text-xs text-muted">/ {deployments.length} total</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">Deployments with history</span>
        </Card>

        {/* Drift Alert Rate */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Drift Alert Rate</span>
            <span className="rounded border border-line bg-bg px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              Rule: &ge;50%
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold ${
                Number(kpis.alertRate) > 30 ? "text-amber" : "text-ink"
              }`}
            >
              {kpis.alertRate}%
            </span>
            <span className="text-xs text-muted">of snapshots</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">Alert threshold ratio</span>
        </Card>
      </div>

      {/* Retraining Lineage Explainer Card */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon name="pipelines" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Controlled Automation Retraining Architecture</h3>
              <p className="text-xs text-muted">
                Drift signals surface recommendations; retraining candidates require champion evaluation and human sign-off before promotion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted overflow-x-auto py-1">
            <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium text-ink">
              1. Drift Snapshot
            </span>
            <span className="text-muted">&rarr;</span>
            <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium text-ink">
              2. Candidate Generation
            </span>
            <span className="text-muted">&rarr;</span>
            <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium text-ink">
              3. Champion Gate
            </span>
            <span className="text-muted">&rarr;</span>
            <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium text-ink">
              4. Human Approval
            </span>
            <span className="text-muted">&rarr;</span>
            <span className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 font-semibold text-green-700">
              5. Promotion
            </span>
          </div>
        </div>
      </Card>

      {/* Snapshot History Section */}
      <Card>
        <CardHeader
          title="Drift Evaluation History"
          subtitle="Historical inference window evaluations, Evidently dataset drift verdicts, and candidate lineage"
        />

        {/* Filter & Search Toolbar */}
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          {/* Status Filter Tabs */}
          <div className="flex rounded-md border border-line bg-bg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded px-3 py-1 transition-all ${
                statusFilter === "all"
                  ? "bg-surface font-semibold text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              All ({snapshots.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("alert")}
              className={`flex items-center gap-1.5 rounded px-3 py-1 transition-all ${
                statusFilter === "alert"
                  ? "bg-surface font-semibold text-red-700 shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              Alertable ({kpis.alertable})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("clean")}
              className={`flex items-center gap-1.5 rounded px-3 py-1 transition-all ${
                statusFilter === "clean"
                  ? "bg-surface font-semibold text-green-700 shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Stable / Clean ({kpis.clean})
            </button>
            {kpis.failed > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("error")}
                className={`rounded px-3 py-1 transition-all ${
                  statusFilter === "error"
                    ? "bg-surface font-semibold text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                Error ({kpis.failed})
              </button>
            )}
          </div>

          {/* Right Toolbar Controls: Deployment Select + Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search snapshots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 rounded-lg border border-line bg-bg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
              <Icon name="search" className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
            </div>

            {/* Deployment Filter Dropdown */}
            <select
              value={selectedDeploymentId}
              onChange={(e) => setSelectedDeploymentId(e.target.value)}
              className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="all">All Deployments</option>
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.model_name} ({d.id.slice(0, 8)}) - {d.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Snapshots Table */}
        <div className="overflow-x-auto">
          {loading && snapshots.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">
              <span className="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle" />
              Loading monitoring snapshots and deployments...
            </div>
          ) : filteredSnapshots.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="monitoring" className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">No Monitoring Snapshots Found</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                {snapshots.length === 0
                  ? "No drift evaluation windows have been uploaded yet. Upload an inference window CSV to evaluate drift against a deployment's training data."
                  : "No snapshots match the selected filter criteria."}
              </p>
              {snapshots.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRunDeployId(deployments.find((d) => d.status === "active")?.id || deployments[0]?.id || "");
                    setShowRunModal(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Icon name="upload" className="h-3.5 w-3.5" />
                  Evaluate First Window
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs text-ink border-collapse">
              <thead>
                <tr className="border-b border-line bg-bg/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
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
              <tbody className="divide-y divide-line">
                {filteredSnapshots.map((snapshot) => {
                  const deployment = deploymentMap.get(snapshot.deployment_id);
                  const version = deployment ? versionMap.get(deployment.model_version_id) : undefined;
                  const candidate = findCandidateForSnapshot(snapshot.id);
                  const driftPct =
                    snapshot.drift_share !== null ? Math.round(snapshot.drift_share * 100) : null;

                  return (
                    <tr
                      key={snapshot.id}
                      className="hover:bg-bg/50 transition-colors group cursor-pointer"
                      onClick={() => {
                        setCandidateActionMessage(null);
                        setCandidateActionError(null);
                        setInspectSnapshot(snapshot);
                      }}
                    >
                      {/* Snapshot ID */}
                      <td className="py-3 px-4 font-mono text-ink">
                        <span className="rounded border border-line bg-bg px-2 py-0.5 text-ink group-hover:border-primary/40 group-hover:text-primary transition-colors">
                          {snapshot.id.slice(0, 8)}
                        </span>
                      </td>

                      {/* Deployment / Model */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-ink flex items-center gap-1.5">
                          <span>{deployment ? deployment.model_name : "Unknown Model"}</span>
                          {version && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                              v{version.version}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted font-mono flex items-center gap-1.5">
                          <span>deploy: {snapshot.deployment_id.slice(0, 8)}</span>
                          {deployment && (
                            <span className="rounded bg-bg px-1.5 py-0.2 text-[10px] text-muted border border-line">
                              {deployment.status}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Drift Status */}
                      <td className="py-3 px-4">
                        {snapshot.status !== "ok" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-0.5 text-[11px] font-medium text-muted">
                            {snapshot.status}
                          </span>
                        ) : snapshot.alert ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                            Alertable Drift
                          </span>
                        ) : snapshot.drift_detected ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] font-medium text-amber">
                            Drift Detected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-700">
                            <Icon name="check-circle" className="h-3 w-3 text-green-600" />
                            Stable / Clean
                          </span>
                        )}
                      </td>

                      {/* Drift Share */}
                      <td className="py-3 px-4">
                        {driftPct !== null ? (
                          <div className="space-y-1 w-28">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-semibold text-ink">{driftPct}%</span>
                              <span className="text-muted text-[10px]">
                                {snapshot.drift_detected ? "drifted" : "stable"}
                              </span>
                            </div>
                            <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${
                                  snapshot.alert
                                    ? "bg-red-500"
                                    : driftPct > 0
                                    ? "bg-amber"
                                    : "bg-green-600"
                                }`}
                                style={{ width: `${Math.min(driftPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Window Rows */}
                      <td className="py-3 px-4 font-mono text-ink">
                        {snapshot.n_rows.toLocaleString()}
                      </td>

                      {/* Evaluated At */}
                      <td className="py-3 px-4">
                        <div className="text-ink font-medium">{formatDate(snapshot.created_at)}</div>
                        <div className="text-[11px] text-muted">
                          {formatRelativeTime(snapshot.created_at)}
                        </div>
                      </td>

                      {/* Retraining Pipeline */}
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {candidate ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded border px-2 py-0.5 text-[11px] font-medium capitalize ${
                                candidate.status === "approved"
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : candidate.status === "rejected" || candidate.status === "promotion_failed"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : candidate.status === "evaluated"
                                  ? "border-amber/30 bg-amber/10 text-amber"
                                  : "border-blue-200 bg-blue-50 text-blue-700"
                              }`}
                            >
                              {candidate.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => navigate("/pipelines")}
                              className="text-[11px] font-medium text-primary hover:underline"
                              title="Navigate to retraining pipeline"
                            >
                              Pipelines &rarr;
                            </button>
                          </div>
                        ) : snapshot.alert ? (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await handleGenerateCandidate(snapshot.id);
                            }}
                            disabled={generateCandidateBusy}
                            className="rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                            title="Generate retraining candidate from this alertable drift snapshot"
                          >
                            Generate Candidate
                          </button>
                        ) : (
                          <span className="text-muted text-[11px]" title="Drift below 50% alert threshold">
                            Below Threshold
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setCandidateActionMessage(null);
                            setCandidateActionError(null);
                            setInspectSnapshot(snapshot);
                          }}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-xs hover:bg-bg transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </Card>

      {/* MODAL 1: Run Monitoring / Upload Inference Window */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-surface border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                  <Icon name="upload" className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-ink">Evaluate Drift Window</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRunModal(false)}
                className="text-muted hover:text-ink p-1 rounded-lg"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleRunMonitoring} className="p-6 space-y-5 overflow-y-auto">
              {runError && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700">
                  {runError}
                </div>
              )}

              {/* Target Deployment Selection */}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
                  Target Deployment Slot <span className="text-red-500">*</span>
                </label>
                <select
                  value={runDeployId}
                  onChange={(e) => setRunDeployId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-bg border border-line rounded-lg text-ink focus:outline-none focus:border-primary"
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
                <p className="mt-1 text-xs text-muted">
                  Evidently evaluates drift between the deployed model's original training dataset and the uploaded window.
                </p>
              </div>

              {/* CSV Upload Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
                  Inference Window CSV File <span className="text-red-500">*</span>
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
                      ? "border-green-500/50 bg-green-50/20"
                      : "border-line hover:border-muted bg-bg/50"
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
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                        <Icon name="check-circle" className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-ink">{windowFile.name}</p>
                      <p className="text-xs text-muted">
                        {(windowFile.size / 1024).toFixed(1)} KB &bull; Click or drop another file to replace
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon name="upload" className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-ink">
                        Drag &amp; drop your inference window CSV here
                      </p>
                      <p className="text-xs text-muted">or click to browse from local drive</p>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Requirements: Must be a CSV containing columns matching the deployed model's input feature set.
                </p>
              </div>

              {/* Evaluation Outcome if executed in-modal */}
              {latestRunResult && (
                <div className="p-4 bg-bg border border-line rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted uppercase">Evaluation Result</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        latestRunResult.alert
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {latestRunResult.alert ? "Alertable Drift Triggered" : "Stable / Non-Alerting"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-surface rounded border border-line">
                      <span className="text-muted block text-[11px]">Drift Share</span>
                      <span className="text-sm font-bold text-ink">
                        {latestRunResult.drift_share !== null
                          ? `${Math.round(latestRunResult.drift_share * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="p-2 bg-surface rounded border border-line">
                      <span className="text-muted block text-[11px]">Dataset Drift</span>
                      <span className="text-sm font-bold text-ink">
                        {latestRunResult.drift_detected ? "Detected" : "Clean"}
                      </span>
                    </div>
                    <div className="p-2 bg-surface rounded border border-line">
                      <span className="text-muted block text-[11px]">Window Rows</span>
                      <span className="text-sm font-bold text-ink">{latestRunResult.n_rows}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRunModal(false);
                        setInspectSnapshot(latestRunResult);
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Inspect Details &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={runBusy || !windowFile || !runDeployId}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {runBusy ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Computing Drift with Evidently...
                    </>
                  ) : (
                    <>
                      <Icon name="monitoring" className="h-4 w-4" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon name="monitoring" className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">Snapshot Inspection</h2>
                  <p className="text-xs text-muted font-mono">ID: {inspectSnapshot.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectSnapshot(null)}
                className="text-muted hover:text-ink p-1 rounded-lg"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Feedback banners */}
              {candidateActionMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs flex items-center gap-2">
                  <Icon name="check-circle" className="h-4 w-4 flex-shrink-0" />
                  <span>{candidateActionMessage}</span>
                </div>
              )}
              {candidateActionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <Icon name="alert-triangle" className="h-4 w-4 flex-shrink-0" />
                  <span>{candidateActionError}</span>
                </div>
              )}

              {/* Snapshot Core Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-bg rounded-xl border border-line">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                    Dataset Drift
                  </span>
                  <span className="text-base font-bold text-ink mt-1 block">
                    {inspectSnapshot.drift_detected ? "Detected" : "Clean"}
                  </span>
                  <span className="text-[10px] text-muted">Evidently verdict</span>
                </div>

                <div className="p-3 bg-bg rounded-xl border border-line">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                    Drift Share
                  </span>
                  <span className="text-base font-bold text-ink mt-1 block">
                    {inspectSnapshot.drift_share !== null
                      ? `${Math.round(inspectSnapshot.drift_share * 100)}%`
                      : "N/A"}
                  </span>
                  <span className="text-[10px] text-muted">Features drifted</span>
                </div>

                <div className="p-3 bg-bg rounded-xl border border-line">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                    Window Rows
                  </span>
                  <span className="text-base font-bold text-ink mt-1 block">
                    {inspectSnapshot.n_rows.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted">Inference samples</span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    inspectSnapshot.alert
                      ? "border-red-200 bg-red-50/40"
                      : "border-green-200 bg-green-50/40"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider block ${
                      inspectSnapshot.alert ? "text-red-700" : "text-green-800"
                    }`}
                  >
                    Alert Status
                  </span>
                  <span
                    className={`text-base font-bold mt-1 block ${
                      inspectSnapshot.alert ? "text-red-900" : "text-green-900"
                    }`}
                  >
                    {inspectSnapshot.alert ? "Triggered" : "Normal"}
                  </span>
                  <span
                    className={`text-[10px] ${
                      inspectSnapshot.alert ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    Threshold: &ge;50%
                  </span>
                </div>
              </div>

              {/* Target Deployment & Timestamp Info */}
              <div className="p-4 bg-bg rounded-xl border border-line space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted">Target Deployment:</span>
                  <span className="font-mono text-ink">
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
                  <span className="text-muted">Drift Type:</span>
                  <span className="text-ink font-mono">{inspectSnapshot.drift_type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Evaluated At:</span>
                  <span className="text-ink">{formatDate(inspectSnapshot.created_at)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Status:</span>
                  <span className="text-ink uppercase font-mono font-semibold">{inspectSnapshot.status}</span>
                </div>
                {inspectSnapshot.error_message && (
                  <div className="pt-2 text-red-700 border-t border-red-200">
                    <strong>Error:</strong> {inspectSnapshot.error_message}
                  </div>
                )}
              </div>

              {/* Feature-Level Drift Analysis Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Feature-Level Drift Analysis</h3>
                  <span className="text-[11px] text-muted">Evidently Adapter</span>
                </div>

                {inspectSnapshot.report && inspectSnapshot.report.drift_by_columns ? (
                  <div className="overflow-x-auto border border-line rounded-lg">
                    <table className="w-full text-left text-xs text-ink">
                      <thead className="bg-bg text-muted uppercase text-[10px] border-b border-line font-semibold">
                        <tr>
                          <th className="py-2 px-3">Column</th>
                          <th className="py-2 px-3">Drift Detected</th>
                          <th className="py-2 px-3">Score / p-value</th>
                          <th className="py-2 px-3">Stat Test</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {Object.entries(
                          inspectSnapshot.report.drift_by_columns as Record<
                            string,
                            { drift_detected: boolean; drift_score: number; stat_test?: string }
                          >
                        ).map(([col, data]) => (
                          <tr key={col} className="hover:bg-bg/50 transition-colors">
                            <td className="py-2 px-3 font-mono text-ink font-medium">{col}</td>
                            <td className="py-2 px-3">
                              {data.drift_detected ? (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-red-50 text-red-700 border border-red-200 font-semibold">
                                  Drift
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-200 font-medium">
                                  Stable
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-ink">
                              {typeof data.drift_score === "number" ? data.drift_score.toFixed(4) : "—"}
                            </td>
                            <td className="py-2 px-3 text-muted">{data.stat_test || "Wasserstein / KS"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-bg border border-line rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <Icon name="chart" className="h-4 w-4 text-primary" />
                      <span>Architecture Note: Dataset-Level Drift vs. Feature Distributions</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Evidently AI statistical tests (Wasserstein distance for continuous features, KS test for categorical)
                      and per-column distribution histograms are evaluated and persisted in PostgreSQL (
                      <code className="text-ink font-mono bg-surface px-1 py-0.5 rounded border border-line">monitoring_snapshots.report</code> JSON column).
                    </p>
                    <p className="text-xs text-muted leading-relaxed">
                      The REST API contract (<code className="text-ink font-mono bg-surface px-1 py-0.5 rounded border border-line">MonitoringSnapshotResponse</code>)
                      exposes aggregate indicators (<code className="text-ink font-mono bg-surface px-1 py-0.5 rounded border border-line">drift_detected</code>,{" "}
                      <code className="text-ink font-mono bg-surface px-1 py-0.5 rounded border border-line">drift_share</code>,{" "}
                      <code className="text-ink font-mono bg-surface px-1 py-0.5 rounded border border-line">alert</code>).
                    </p>
                  </div>
                )}
              </div>

              {/* Drift-to-Retraining Lineage & Actions */}
              <div className="p-4 bg-bg border border-line rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="pipelines" className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
                      Drift-to-Retraining Lineage
                    </h3>
                  </div>
                  {findCandidateForSnapshot(inspectSnapshot.id) && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-green-200">
                      Candidate Exists
                    </span>
                  )}
                </div>

                {(() => {
                  const candidate = findCandidateForSnapshot(inspectSnapshot.id);

                  if (candidate) {
                    return (
                      <div className="space-y-3">
                        <div className="p-3 bg-surface border border-line rounded-lg text-xs space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted">Candidate ID:</span>
                            <span className="font-mono text-ink">{candidate.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Lifecycle Status:</span>
                            <span className="font-semibold text-primary uppercase">{candidate.status}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted">Trigger Source:</span>
                            <span className="text-ink font-mono">{candidate.source}</span>
                          </div>
                          {candidate.evaluation && (
                            <div className="flex justify-between">
                              <span className="text-muted">Gate Passed:</span>
                              <span
                                className={`font-semibold ${
                                  candidate.evaluation.passed ? "text-green-700" : "text-red-700"
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
                              <span className="text-muted">Human Sign-off:</span>
                              <span className="font-medium text-ink uppercase">
                                {candidate.decision} by {candidate.decided_by || "user"}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectSnapshot(null);
                              navigate("/pipelines");
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
                          >
                            <Icon name="pipelines" className="h-3.5 w-3.5" />
                            Open in Retraining Pipelines &rarr;
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (inspectSnapshot.alert) {
                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-muted">
                          This snapshot flagged significant data drift ({Math.round((inspectSnapshot.drift_share || 0) * 100)}% feature drift).
                          You can generate a controlled retraining candidate using the original dataset configuration.
                        </p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleGenerateCandidate(inspectSnapshot.id)}
                            disabled={generateCandidateBusy}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            {generateCandidateBusy ? (
                              <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Generating Candidate...
                              </>
                            ) : (
                              <>
                                <Icon name="pipelines" className="h-3.5 w-3.5" />
                                Generate Retraining Candidate
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 bg-surface border border-line rounded-lg text-xs text-muted space-y-1">
                      <p className="font-medium text-ink">Retraining candidate generation gated</p>
                      <p>
                        This snapshot is below the alert threshold (requires Evidently dataset drift verdict or &ge;50% drifted features).
                        Automated candidate generation from snapshot is reserved for alertable drift events.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setInspectSnapshot(null)}
                  className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors"
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
