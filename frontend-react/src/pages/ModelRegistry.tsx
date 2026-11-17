import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  ApiError,
  type ChampionChallengerResponse,
  type JobSummary,
  type ModelVersion,
} from "../api/types";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

const LIFECYCLE_BADGE_CLASSES: Record<string, string> = {
  production: "bg-green-100 text-green-800 border-green-200",
  staging: "bg-amber/15 text-amber border-amber/30",
  development: "bg-blue-50 text-blue-700 border-blue-200",
  archived: "bg-line/60 text-muted border-line",
};

// State transitions supported by api/registry_service.py
const ALLOWED_TARGETS: Record<string, ("development" | "staging" | "production" | "archived")[]> = {
  development: ["staging", "archived"],
  staging: ["production", "development", "archived"],
  production: ["archived"],
  archived: ["staging"],
};

export function ModelRegistry() {
  const navigate = useNavigate();

  // Data state
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "version">("newest");

  // Selection / Modal state
  const [selectedVersion, setSelectedVersion] = useState<ModelVersion | null>(null);
  const [compareData, setCompareData] = useState<ChampionChallengerResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Promotion Confirmation Modal
  const [promotionTarget, setPromotionTarget] = useState<{
    version: ModelVersion;
    targetState: "development" | "staging" | "production" | "archived";
  } | null>(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);

  // Rollback Confirmation Modal
  const [rollbackTarget, setRollbackTarget] = useState<ModelVersion | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  // Job Registration Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [trainJobs, setTrainJobs] = useState<JobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [registeringJobId, setRegisteringJobId] = useState<string | null>(null);

  function loadRegistry() {
    setLoading(true);
    api
      .listRegistryVersions()
      .then((data) => {
        setVersions(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load model registry versions.");
        setVersions([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRegistry();
  }, []);

  // Distinct model names
  const uniqueModelNames = useMemo(() => {
    return Array.from(new Set(versions.map((v) => v.model_name))).sort();
  }, [versions]);

  // Derived KPI metrics
  const kpis = useMemo(() => {
    const totalModels = uniqueModelNames.length;
    const totalVersions = versions.length;
    const production = versions.filter((v) => v.lifecycle_state === "production").length;
    const staging = versions.filter((v) => v.lifecycle_state === "staging").length;
    const development = versions.filter((v) => v.lifecycle_state === "development").length;
    const archived = versions.filter((v) => v.lifecycle_state === "archived").length;
    return { totalModels, totalVersions, production, staging, development, archived };
  }, [versions, uniqueModelNames]);

  // Filtered and sorted versions
  const filteredVersions = useMemo(() => {
    return versions
      .filter((v) => {
        const matchesSearch =
          v.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          `v${v.version}`.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLifecycle = lifecycleFilter === "all" || v.lifecycle_state === lifecycleFilter;
        const matchesModel = modelFilter === "all" || v.model_name === modelFilter;
        return matchesSearch && matchesLifecycle && matchesModel;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        return b.version - a.version;
      });
  }, [versions, searchQuery, lifecycleFilter, modelFilter, sortBy]);

  // Open Compare Modal
  async function handleOpenCompare(challenger: ModelVersion) {
    setCompareLoading(true);
    setCompareError(null);
    setCompareData(null);
    try {
      const res = await api.compareChampionChallenger(challenger.id);
      setCompareData(res);
    } catch (err) {
      setCompareError(err instanceof ApiError ? err.message : "Failed to compare model versions.");
    } finally {
      setCompareLoading(false);
    }
  }

  // Execute Promotion
  async function handleConfirmPromotion() {
    if (!promotionTarget) return;
    setPromotionBusy(true);
    setPromotionError(null);
    try {
      const updated = await api.promoteModelVersion(
        promotionTarget.version.id,
        promotionTarget.targetState
      );
      setActionSuccess(
        `Successfully promoted ${updated.model_name} v${updated.version} to ${updated.lifecycle_state}.`
      );
      setPromotionTarget(null);
      if (selectedVersion?.id === updated.id) {
        setSelectedVersion(updated);
      }
      loadRegistry();
    } catch (err) {
      setPromotionError(err instanceof ApiError ? err.message : "Promotion failed.");
    } finally {
      setPromotionBusy(false);
    }
  }

  // Execute Rollback
  async function handleConfirmRollback() {
    if (!rollbackTarget) return;
    setRollbackBusy(true);
    setRollbackError(null);
    try {
      const restored = await api.rollbackModelVersion(rollbackTarget.id);
      setActionSuccess(
        `Rollback successful: Restored ${restored.model_name} v${restored.version} to production champion.`
      );
      setRollbackTarget(null);
      if (selectedVersion?.id === rollbackTarget.id) {
        setSelectedVersion(null);
      }
      loadRegistry();
    } catch (err) {
      setRollbackError(err instanceof ApiError ? err.message : "Rollback failed.");
    } finally {
      setRollbackBusy(false);
    }
  }

  // Open Register Succeeded Jobs Modal
  async function handleOpenRegisterModal() {
    setShowRegisterModal(true);
    setLoadingJobs(true);
    try {
      const allJobs = await api.listJobs("train");
      // filter to succeeded jobs whose job_id is not already registered
      const registeredJobIds = new Set(versions.map((v) => v.job_id));
      const unregistered = allJobs.filter(
        (j) => j.status === "succeeded" && !registeredJobIds.has(j.id)
      );
      setTrainJobs(unregistered);
    } catch {
      setTrainJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }

  // Register Job
  async function handleRegisterJob(jobId: string) {
    setRegisteringJobId(jobId);
    try {
      const newVersion = await api.registerModel(jobId);
      setActionSuccess(
        `Model ${newVersion.model_name} registered as v${newVersion.version} in development.`
      );
      setShowRegisterModal(false);
      loadRegistry();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setRegisteringJobId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[28px] font-bold text-ink">Model Registry</h1>
          <p className="text-sm text-muted">
            Authoritative lifecycle state management, version lineage, automated quality gates, and rollback governance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenRegisterModal}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-bg transition-colors"
          >
            <Icon name="upload" className="h-4 w-4 text-primary" />
            Register Training Job
          </button>
          <button
            type="button"
            onClick={() => navigate("/train")}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Icon name="train-model" className="h-4 w-4" />
            Train New Model
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 text-xs text-green-900">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="h-4 w-4 text-green-600" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-green-700 hover:text-green-900">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-4 w-4 text-red-600" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-muted uppercase">Model Families</span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.totalModels}</div>
          <span className="mt-1 text-[11px] text-muted">Distinct algorithms</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-muted uppercase">Total Versions</span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.totalVersions}</div>
          <span className="mt-1 text-[11px] text-muted">All registered versions</span>
        </Card>

        <Card className="flex flex-col justify-between border-green-200/80 bg-green-50/20">
          <span className="text-xs font-medium text-green-800 uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-600" />
            Production
          </span>
          <div className="mt-2 text-2xl font-bold text-green-900">{kpis.production}</div>
          <span className="mt-1 text-[11px] text-green-700">Active champions</span>
        </Card>

        <Card className="flex flex-col justify-between border-amber/30 bg-amber/5">
          <span className="text-xs font-medium text-amber uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber" />
            Staging
          </span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.staging}</div>
          <span className="mt-1 text-[11px] text-muted">Pre-production gates</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-blue-700 uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Development
          </span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.development}</div>
          <span className="mt-1 text-[11px] text-muted">Initial training state</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-muted uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted/50" />
            Archived
          </span>
          <div className="mt-2 text-2xl font-bold text-muted">{kpis.archived}</div>
          <span className="mt-1 text-[11px] text-muted">Historical versions</span>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        {/* Table Filters & Search */}
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search models or IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border border-line bg-bg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none w-56"
              />
              <Icon name="search" className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
            </div>

            {/* Model Family Filter */}
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="all">All Model Families</option>
              {uniqueModelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="version">Sort: Version (High-Low)</option>
            </select>
          </div>

          {/* Lifecycle Filter Tabs */}
          <div className="flex rounded-md border border-line bg-bg p-0.5 text-xs">
            {["all", "production", "staging", "development", "archived"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setLifecycleFilter(st)}
                className={`rounded px-3 py-1 capitalize transition-all ${
                  lifecycleFilter === st
                    ? "bg-surface font-semibold text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Versions Table */}
        {loading ? (
          <div className="py-12 text-center text-xs text-muted">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
            Loading registered models...
          </div>
        ) : filteredVersions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="model-registry" className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink">No Model Versions Found</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              {versions.length === 0
                ? "No models have been registered yet. Train a model and register it to begin version control."
                : "No registered versions match the selected search or lifecycle filter criteria."}
            </p>
            {versions.length === 0 && (
              <button
                type="button"
                onClick={() => navigate("/train")}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Icon name="train-model" className="h-3.5 w-3.5" />
                Train First Model
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg text-muted font-semibold uppercase tracking-wider border-b border-line">
                <tr>
                  <th className="py-3 px-4">Model &amp; Version</th>
                  <th className="py-3 px-4">Lifecycle State</th>
                  <th className="py-3 px-4">Task &amp; Metrics</th>
                  <th className="py-3 px-4">Registered</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {filteredVersions.map((ver) => {
                  const isProduction = ver.lifecycle_state === "production";
                  const metrics = ver.model_card?.metrics ?? {};
                  const taskType = ver.model_card?.task_type ?? "classification";
                  const primaryMetricName = taskType === "classification" ? "F1" : "R²";
                  const primaryVal =
                    metrics[primaryMetricName.toLowerCase()] ??
                    metrics.f1 ??
                    metrics.r2 ??
                    metrics.accuracy;
                  const allowedTransitions = ALLOWED_TARGETS[ver.lifecycle_state] ?? [];
                  const hasRollback = isProduction && Boolean(ver.promoted_from);

                  return (
                    <tr key={ver.id} className="hover:bg-bg/50 transition-colors">
                      {/* Name & Version */}
                      <td className="py-3.5 px-4 font-medium text-ink">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{ver.model_name}</span>
                          <span className="rounded bg-line/70 px-1.5 py-0.5 font-mono text-[11px] text-ink font-semibold">
                            v{ver.version}
                          </span>
                          {isProduction && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800 flex items-center gap-1 border border-green-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
                              Champion
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono text-muted truncate max-w-xs">
                          {ver.id}
                        </div>
                      </td>

                      {/* Lifecycle State */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border capitalize ${
                            LIFECYCLE_BADGE_CLASSES[ver.lifecycle_state] ?? "bg-line text-muted"
                          }`}
                        >
                          {ver.lifecycle_state}
                        </span>
                        {ver.promoted_at && (
                          <div className="mt-0.5 text-[10px] text-muted">
                            Promoted {new Date(ver.promoted_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Task & Metrics */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-muted uppercase">
                            {taskType}
                          </span>
                          {primaryVal !== undefined ? (
                            <span className="font-semibold text-ink">
                              {primaryMetricName}: {typeof primaryVal === "number" ? primaryVal.toFixed(4) : primaryVal}
                            </span>
                          ) : (
                            <span className="text-muted italic">No metrics recorded</span>
                          )}
                        </div>
                        {metrics.accuracy !== undefined && taskType === "classification" && (
                          <div className="mt-0.5 text-[10px] text-muted">
                            Acc: {typeof metrics.accuracy === "number" ? (metrics.accuracy * 100).toFixed(1) : metrics.accuracy}%
                          </div>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3.5 px-4 text-muted">
                        <div>{new Date(ver.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px]">{new Date(ver.created_at).toLocaleTimeString()}</div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedVersion(ver)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-ink bg-bg hover:bg-line transition-colors border border-line"
                          >
                            Details
                          </button>

                          {/* Compare Challenger with Champion */}
                          {!isProduction && (
                            <button
                              type="button"
                              onClick={() => handleOpenCompare(ver)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                            >
                              Compare
                            </button>
                          )}

                          {/* Promote Button (Opens Target Selection) */}
                          {allowedTransitions.length > 0 && (
                            <div className="relative inline-block text-left">
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  const targetState = e.target.value as any;
                                  if (targetState) {
                                    setPromotionTarget({ version: ver, targetState });
                                    e.target.value = "";
                                  }
                                }}
                                className="rounded px-2 py-1 text-xs font-medium text-ink bg-bg hover:bg-line border border-line cursor-pointer focus:outline-none"
                              >
                                <option value="" disabled>
                                  Promote / Stage...
                                </option>
                                {allowedTransitions.map((target) => (
                                  <option key={target} value={target}>
                                    To {target}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Rollback Production */}
                          {hasRollback && (
                            <button
                              type="button"
                              onClick={() => setRollbackTarget(ver)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                            >
                              Rollback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Model Details Inspection Modal */}
      {selectedVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="model-registry" className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-ink">{selectedVersion.model_name}</h2>
                    <span className="rounded bg-line/70 px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                      v{selectedVersion.version}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border capitalize ${
                        LIFECYCLE_BADGE_CLASSES[selectedVersion.lifecycle_state]
                      }`}
                    >
                      {selectedVersion.lifecycle_state}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-muted mt-0.5">ID: {selectedVersion.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVersion(null)}
                className="text-muted hover:text-ink"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Source Training Job</span>
                <p className="font-mono font-medium text-ink truncate mt-0.5">
                  {selectedVersion.job_id}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Dataset Fingerprint</span>
                <p className="font-mono font-medium text-ink truncate mt-0.5">
                  {selectedVersion.model_card?.dataset_fingerprint ?? "N/A"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">MLflow Tracking Run</span>
                <p className="font-mono font-medium text-ink truncate mt-0.5">
                  {selectedVersion.model_card?.mlflow_run_id ?? "Local tracking"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Registered At</span>
                <p className="font-medium text-ink mt-0.5">
                  {new Date(selectedVersion.created_at).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Promoted At</span>
                <p className="font-medium text-ink mt-0.5">
                  {selectedVersion.promoted_at
                    ? new Date(selectedVersion.promoted_at).toLocaleString()
                    : "Not promoted"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Prior Production Version</span>
                <p className="font-mono font-medium text-ink truncate mt-0.5">
                  {selectedVersion.promoted_from ?? "None"}
                </p>
              </div>
            </div>

            {/* Metrics Section */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Evaluation Metrics
              </h3>
              {selectedVersion.model_card?.metrics &&
              Object.keys(selectedVersion.model_card.metrics).length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(selectedVersion.model_card.metrics).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-line bg-bg p-2.5">
                      <span className="text-[11px] text-muted uppercase">{k}</span>
                      <p className="text-base font-bold text-ink">
                        {typeof v === "number" ? v.toFixed(4) : String(v)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted italic">No evaluation metrics recorded.</p>
              )}
            </div>

            {/* Model Parameters / Configuration */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Model Parameters &amp; Config
              </h3>
              <pre className="max-h-36 overflow-x-auto rounded-lg border border-line bg-bg p-3 text-[11px] text-ink font-mono">
                {JSON.stringify(selectedVersion.model_card?.model_params ?? {}, null, 2)}
              </pre>
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="flex items-center gap-2">
                {selectedVersion.lifecycle_state !== "production" && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenCompare(selectedVersion);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition-colors"
                  >
                    <Icon name="chart" className="h-3.5 w-3.5 text-primary" />
                    Compare with Champion
                  </button>
                )}
                {(selectedVersion.lifecycle_state === "staging" ||
                  selectedVersion.lifecycle_state === "production") && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedVersion.id;
                      setSelectedVersion(null);
                      navigate("/deployments", { state: { deployVersionId: id } });
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Icon name="deployment" className="h-3.5 w-3.5" />
                    Deploy to Serving
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const vId = selectedVersion.id;
                    const jId = selectedVersion.job_id;
                    setSelectedVersion(null);
                    navigate("/explainability", { state: { versionId: vId, jobId: jId } });
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition-colors"
                >
                  <Icon name="explainability" className="h-3.5 w-3.5 text-primary" />
                  Explain Model (SHAP)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVersion(null)}
                className="rounded-lg border border-line px-4 py-1.5 text-xs font-medium text-ink hover:bg-bg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Champion vs Challenger Comparison Modal */}
      {(compareData || compareLoading || compareError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Champion vs. Challenger Comparison</h2>
                <p className="text-xs text-muted">
                  Side-by-side metric comparison between production champion and candidate challenger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompareData(null);
                  setCompareError(null);
                }}
                className="text-muted hover:text-ink"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {compareLoading ? (
              <div className="py-12 text-center text-xs text-muted">Comparing versions...</div>
            ) : compareError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                {compareError}
              </div>
            ) : compareData ? (
              <div className="space-y-4">
                {/* Recommendation Banner */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-ink">
                  <div className="flex items-center gap-2 font-semibold text-primary mb-1">
                    <Icon name="check-circle" className="h-4 w-4" />
                    <span>Evaluation Recommendation:</span>
                  </div>
                  <p className="text-xs text-ink pl-6">{compareData.recommendation}</p>
                </div>

                {/* Side-by-Side Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Champion Card */}
                  <div className="rounded-lg border border-green-200 bg-green-50/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-green-800 uppercase tracking-wider">
                        Production Champion
                      </span>
                      {compareData.champion && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                          v{compareData.champion.version}
                        </span>
                      )}
                    </div>

                    {compareData.champion ? (
                      <div className="space-y-2 text-xs">
                        <div className="font-semibold text-ink">{compareData.champion.model_name}</div>
                        <div className="text-[11px] font-mono text-muted truncate">
                          ID: {compareData.champion.id}
                        </div>
                        <div className="text-[11px] text-muted">
                          Promoted:{" "}
                          {compareData.champion.promoted_at
                            ? new Date(compareData.champion.promoted_at).toLocaleDateString()
                            : "N/A"}
                        </div>

                        <div className="mt-3 border-t border-line/60 pt-2">
                          <span className="text-[10px] uppercase font-semibold text-muted">Metrics</span>
                          <div className="mt-1 space-y-1">
                            {compareData.champion_metrics &&
                            Object.keys(compareData.champion_metrics).length > 0 ? (
                              Object.entries(compareData.champion_metrics).map(([k, v]) => (
                                <div key={k} className="flex justify-between text-xs">
                                  <span className="capitalize text-muted">{k}:</span>
                                  <span className="font-semibold text-ink">
                                    {typeof v === "number" ? v.toFixed(4) : String(v)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="italic text-muted">No metrics</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-muted italic">
                        No production champion exists yet for {compareData.model_name}.
                      </div>
                    )}
                  </div>

                  {/* Challenger Card */}
                  <div className="rounded-lg border border-line bg-bg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                        Challenger Model
                      </span>
                      <span className="rounded bg-line/80 px-2 py-0.5 text-[10px] font-bold text-ink">
                        v{compareData.challenger.version}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="font-semibold text-ink">{compareData.challenger.model_name}</div>
                      <div className="text-[11px] font-mono text-muted truncate">
                        ID: {compareData.challenger.id}
                      </div>
                      <div className="text-[11px] text-muted">
                        State:{" "}
                        <span className="capitalize font-semibold text-ink">
                          {compareData.challenger.lifecycle_state}
                        </span>
                      </div>

                      <div className="mt-3 border-t border-line/60 pt-2">
                        <span className="text-[10px] uppercase font-semibold text-muted">Metrics</span>
                        <div className="mt-1 space-y-1">
                          {compareData.challenger_metrics &&
                          Object.keys(compareData.challenger_metrics).length > 0 ? (
                            Object.entries(compareData.challenger_metrics).map(([k, v]) => {
                              const champVal = compareData.champion_metrics?.[k];
                              const isBetter =
                                typeof v === "number" &&
                                typeof champVal === "number" &&
                                v > champVal;
                              return (
                                <div key={k} className="flex justify-between text-xs">
                                  <span className="capitalize text-muted">{k}:</span>
                                  <span
                                    className={`font-semibold ${
                                      isBetter ? "text-green-700 font-bold" : "text-ink"
                                    }`}
                                  >
                                    {typeof v === "number" ? v.toFixed(4) : String(v)}
                                    {isBetter && " (▲)"}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <span className="italic text-muted">No metrics</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direct Action from Compare */}
                <div className="flex justify-end gap-2 border-t border-line pt-3">
                  {compareData.challenger.lifecycle_state === "staging" && (
                    <button
                      type="button"
                      onClick={() => {
                        const ver = compareData.challenger;
                        setCompareData(null);
                        setPromotionTarget({ version: ver, targetState: "production" });
                      }}
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                    >
                      Promote Challenger to Production
                    </button>
                  )}
                  {compareData.challenger.lifecycle_state === "development" && (
                    <button
                      type="button"
                      onClick={() => {
                        const ver = compareData.challenger;
                        setCompareData(null);
                        setPromotionTarget({ version: ver, targetState: "staging" });
                      }}
                      className="rounded-lg bg-amber px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                    >
                      Promote Challenger to Staging First
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCompareData(null)}
                    className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Promotion Confirmation Modal */}
      {promotionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-ink">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="arrow-right" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">Confirm Lifecycle Transition</h3>
                <p className="text-xs text-muted">Consequential governance action</p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-bg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Model:</span>
                <span className="font-semibold text-ink">
                  {promotionTarget.version.model_name} (v{promotionTarget.version.version})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Current Stage:</span>
                <span className="font-semibold capitalize text-ink">
                  {promotionTarget.version.lifecycle_state}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Target Stage:</span>
                <span className="font-bold capitalize text-primary">
                  {promotionTarget.targetState}
                </span>
              </div>
            </div>

            {promotionTarget.targetState === "production" && (
              <div className="rounded-lg border border-amber/30 bg-amber/5 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-amber">
                  <Icon name="alert-triangle" className="h-4 w-4" />
                  Production Gate &amp; Replacement Notice:
                </p>
                <p className="text-[11px] text-ink leading-relaxed">
                  Promoting to production will verify that primary evaluation metrics satisfy the configured quality gate.
                  Any existing production champion for this model name will be archived and designated as the rollback target.
                </p>
              </div>
            )}

            {promotionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <span className="font-semibold">Promotion Rejected:</span> {promotionError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={promotionBusy}
                onClick={() => setPromotionTarget(null)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={promotionBusy}
                onClick={handleConfirmPromotion}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {promotionBusy ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Promoting...
                  </>
                ) : (
                  `Confirm ${promotionTarget.targetState}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">Rollback Production Champion</h3>
                <p className="text-xs text-muted">Revert live production to previous champion</p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-bg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Current Champion:</span>
                <span className="font-semibold text-ink">
                  {rollbackTarget.model_name} v{rollbackTarget.version}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Target Prior Version:</span>
                <span className="font-mono text-ink text-[11px] truncate max-w-[200px]">
                  {rollbackTarget.promoted_from}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Action:</span>
                <span className="font-semibold text-red-700">Demote current to Archived</span>
              </div>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              This action atomically demotes the current production champion to archived and re-instates the recorded previous production version.
            </p>

            {rollbackError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <span className="font-semibold">Rollback Error:</span> {rollbackError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={rollbackBusy}
                onClick={() => setRollbackTarget(null)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rollbackBusy}
                onClick={handleConfirmRollback}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rollbackBusy ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Rolling back...
                  </>
                ) : (
                  "Confirm Rollback"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Succeeded Training Job Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-bold text-base text-ink">Register Succeeded Training Job</h3>
                <p className="text-xs text-muted">
                  Select a completed training job to create a new version in the Model Registry.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="text-muted hover:text-ink"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {loadingJobs ? (
              <div className="py-8 text-center text-xs text-muted">Loading available jobs...</div>
            ) : trainJobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                No unregistered succeeded training jobs found. Train a new model first.
              </div>
            ) : (
              <div className="divide-y divide-line rounded-lg border border-line">
                {trainJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3.5 hover:bg-bg/50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-ink">{job.model_name ?? "Model"}</span>
                        <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-muted uppercase">
                          {job.task_type ?? "classification"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        Dataset: <span className="text-ink">{job.dataset_filename ?? "uploaded.csv"}</span> • Finished:{" "}
                        {job.finished_at ? new Date(job.finished_at).toLocaleString() : "Recently"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={registeringJobId === job.id}
                      onClick={() => handleRegisterJob(job.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {registeringJobId === job.id ? (
                        <>
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Registering...
                        </>
                      ) : (
                        "Register Version"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}