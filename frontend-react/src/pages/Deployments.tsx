import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  ApiError,
  type DeploymentMetricsResponse,
  type ModelVersion,
  type PredictJSONResponse,
} from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

export function Deployments() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { deployVersionId?: string } | null;

  // Tab state
  const [activeTab, setActiveTab] = useState<"deployments" | "inference">("deployments");

  // Core data state
  const [deployments, setDeployments] = useState<DeploymentMetricsResponse[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtering & Sorting
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployingVersionId, setDeployingVersionId] = useState<string | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [inspectDeployment, setInspectDeployment] = useState<DeploymentMetricsResponse | null>(null);

  const [stopTarget, setStopTarget] = useState<DeploymentMetricsResponse | null>(null);
  const [stopBusy, setStopBusy] = useState(false);

  const [rollbackTarget, setRollbackTarget] = useState<DeploymentMetricsResponse | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  // Inference Playground state
  const [selectedInferenceDeployId, setSelectedInferenceDeployId] = useState<string>("");
  const [jsonInput, setJsonInput] = useState<string>("{\n  \"features\": {}\n}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictResult, setPredictResult] = useState<PredictJSONResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [inputColsForActive, setInputColsForActive] = useState<string[]>([]);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Load all deployments and their live metrics
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [rawDeploys, regVersions] = await Promise.all([
        api.listDeployments(),
        api.listRegistryVersions(),
      ]);
      setVersions(regVersions);

      // Fetch live metrics for each deployment in parallel
      const withMetrics = await Promise.all(
        rawDeploys.map(async (d) => {
          try {
            return await api.getDeployment(d.id);
          } catch {
            return {
              ...d,
              request_count: 0,
              error_count: 0,
              avg_latency_ms: null,
              max_latency_ms: null,
            } as DeploymentMetricsResponse;
          }
        })
      );
      setDeployments(withMetrics);

      // If user navigated here with a version to deploy, open modal
      if (state?.deployVersionId) {
        setDeployingVersionId(state.deployVersionId);
        setShowDeployModal(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load deployments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Set initial selected inference deployment
  useEffect(() => {
    if (!selectedInferenceDeployId && deployments.length > 0) {
      const activeOne = deployments.find((d) => d.status === "active") ?? deployments[0];
      setSelectedInferenceDeployId(activeOne.id);
    }
  }, [deployments, selectedInferenceDeployId]);

  // When selected inference deployment changes, inspect its required input cols
  useEffect(() => {
    if (!selectedInferenceDeployId) return;
    const deploy = deployments.find((d) => d.id === selectedInferenceDeployId);
    if (!deploy) return;
    const version = versions.find((v) => v.id === deploy.model_version_id);
    if (!version) return;

    // Fetch job detail to inspect input cols
    api
      .getJob(version.job_id)
      .then((job) => {
        const cols = (job.input_cols as string[]) || [];
        setInputColsForActive(cols);
        // Pre-fill a sample JSON template if the current input is empty or default
        if (jsonInput.trim() === "{\n  \"features\": {}\n}" || !jsonInput.includes("features")) {
          const sampleFeatures: Record<string, any> = {};
          for (const col of cols) {
            sampleFeatures[col] = 0;
          }
          setJsonInput(JSON.stringify({ features: sampleFeatures }, null, 2));
        }
      })
      .catch(() => {
        setInputColsForActive([]);
      });
  }, [selectedInferenceDeployId, deployments, versions]);

  // Derived KPI metrics
  const kpis = useMemo(() => {
    const total = deployments.length;
    const active = deployments.filter((d) => d.status === "active").length;
    const replaced = deployments.filter((d) => d.status === "replaced").length;
    const stopped = deployments.filter((d) => d.status === "stopped").length;
    const totalRequests = deployments.reduce((acc, d) => acc + (d.request_count || 0), 0);
    const withLatency = deployments.filter((d) => d.avg_latency_ms !== null);
    const avgLatency =
      withLatency.length > 0
        ? (
            withLatency.reduce((acc, d) => acc + (d.avg_latency_ms || 0), 0) / withLatency.length
          ).toFixed(2)
        : null;

    return { total, active, replaced, stopped, totalRequests, avgLatency };
  }, [deployments]);

  // Filtered Deployments
  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      const matchesSearch =
        d.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [deployments, searchQuery, statusFilter]);

  // Deployable models from registry (must be staging or production)
  const deployableVersions = useMemo(() => {
    return versions.filter(
      (v) => v.lifecycle_state === "staging" || v.lifecycle_state === "production"
    );
  }, [versions]);

  // Execute Deploy
  async function handleConfirmDeploy() {
    if (!deployingVersionId) return;
    setDeployBusy(true);
    setDeployError(null);
    try {
      const res = await api.deployModel(deployingVersionId);
      setActionSuccess(`Successfully deployed ${res.model_name} to active serving.`);
      setShowDeployModal(false);
      setDeployingVersionId(null);
      loadData();
    } catch (err) {
      setDeployError(err instanceof ApiError ? err.message : "Deployment failed.");
    } finally {
      setDeployBusy(false);
    }
  }

  // Execute Stop
  async function handleConfirmStop() {
    if (!stopTarget) return;
    setStopBusy(true);
    try {
      await api.stopDeployment(stopTarget.id);
      setActionSuccess(`Serving stopped for deployment ${stopTarget.id.slice(0, 8)}.`);
      setStopTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not stop deployment.");
    } finally {
      setStopBusy(false);
    }
  }

  // Execute Rollback
  async function handleConfirmRollback() {
    if (!rollbackTarget) return;
    setRollbackBusy(true);
    try {
      const restored = await api.rollbackDeployment(rollbackTarget.id);
      setActionSuccess(
        `Rollback complete: Restored deployment ${restored.id.slice(0, 8)} (${restored.model_name}) to active serving.`
      );
      setRollbackTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rollback failed.");
    } finally {
      setRollbackBusy(false);
    }
  }

  // Execute Real-Time Prediction
  async function handleExecutePrediction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInferenceDeployId) {
      setPredictError("Please select an active deployment.");
      return;
    }

    setPredictLoading(true);
    setPredictError(null);
    setPredictResult(null);
    setJsonError(null);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err) {
      setJsonError("Invalid JSON syntax. Please check brackets, quotes, and commas.");
      setPredictLoading(false);
      return;
    }

    if (!parsed || typeof parsed !== "object" || !parsed.features || typeof parsed.features !== "object") {
      setJsonError('Request body must be an object containing a "features" dictionary: {"features": {...}}');
      setPredictLoading(false);
      return;
    }

    try {
      const res = await api.predictJSON(selectedInferenceDeployId, parsed.features);
      setPredictResult(res);
      // Refresh metrics for this deployment silently
      api.getDeployment(selectedInferenceDeployId).then((updated) => {
        setDeployments((prev) =>
          prev.map((d) => (d.id === selectedInferenceDeployId ? updated : d))
        );
      });
    } catch (err) {
      setPredictError(err instanceof ApiError ? err.message : "Prediction execution failed.");
    } finally {
      setPredictLoading(false);
    }
  }

  function handleFillSamplePayload() {
    const sampleFeatures: Record<string, any> = {};
    for (const col of inputColsForActive) {
      // Sensible defaults
      if (col.toLowerCase().includes("age")) sampleFeatures[col] = 34;
      else if (col.toLowerCase().includes("charges") || col.toLowerCase().includes("income"))
        sampleFeatures[col] = 75.5;
      else if (col.toLowerCase().includes("tenure")) sampleFeatures[col] = 12;
      else if (col.toLowerCase().includes("city")) sampleFeatures[col] = "NY";
      else if (col.toLowerCase().includes("contract")) sampleFeatures[col] = "month-to-month";
      else sampleFeatures[col] = 1;
    }
    setJsonInput(JSON.stringify({ features: sampleFeatures }, null, 2));
    setJsonError(null);
  }

  function handleCopyResponse() {
    if (!predictResult) return;
    navigator.clipboard.writeText(JSON.stringify(predictResult, null, 2));
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Deployments &amp; Inference"
        subtitle="Manage serving deployment slots, observe real-time latency metrics, and test live JSON inference."
        actions={
          <>
            <div className="flex rounded-lg border border-line bg-surface p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("deployments")}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "deployments" ? "bg-primary text-white" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name="deployment" className="h-4 w-4" />
                Serving Slots ({kpis.active})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("inference")}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "inference" ? "bg-primary text-white" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name="predictions" className="h-4 w-4" />
                Inference Playground
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setDeployingVersionId(deployableVersions[0]?.id ?? null);
                setShowDeployModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
            >
              <Icon name="upload" className="h-4 w-4" />
              Deploy Model
            </button>
          </>
        }
      />

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
          <span className="text-xs font-medium text-muted uppercase">Total Deployments</span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.total}</div>
          <span className="mt-1 text-[11px] text-muted">All historical slots</span>
        </Card>

        <Card className="flex flex-col justify-between border-green-200/80 bg-green-50/20">
          <span className="text-xs font-medium text-green-800 uppercase flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
            Active Serving
          </span>
          <div className="mt-2 text-2xl font-bold text-green-900">{kpis.active}</div>
          <span className="mt-1 text-[11px] text-green-700">Live endpoint slots</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-muted uppercase">Replaced</span>
          <div className="mt-2 text-2xl font-bold text-muted">{kpis.replaced}</div>
          <span className="mt-1 text-[11px] text-muted">Superseded versions</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-red-700 uppercase">Stopped</span>
          <div className="mt-2 text-2xl font-bold text-red-700">{kpis.stopped}</div>
          <span className="mt-1 text-[11px] text-muted">Halted traffic</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-primary uppercase">Total Inferences</span>
          <div className="mt-2 text-2xl font-bold text-ink">{kpis.totalRequests.toLocaleString()}</div>
          <span className="mt-1 text-[11px] text-muted">Real-time JSON calls</span>
        </Card>

        <Card className="flex flex-col justify-between">
          <span className="text-xs font-medium text-muted uppercase">Avg Latency</span>
          <div className="mt-2 text-2xl font-bold text-ink">
            {kpis.avgLatency !== null ? `${kpis.avgLatency} ms` : "N/A"}
          </div>
          <span className="mt-1 text-[11px] text-muted">Serving execution speed</span>
        </Card>
      </div>

      {activeTab === "deployments" ? (
        /* Serving Slots Table */
        <Card>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search model or deployment ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-line bg-bg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none w-64"
                />
                <Icon name="search" className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
              </div>
            </div>

            <div className="flex rounded-md border border-line bg-bg p-0.5 text-xs">
              {["all", "active", "replaced", "stopped"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded px-3 py-1 capitalize transition-all ${
                    statusFilter === st
                      ? "bg-surface font-semibold text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-muted">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
              Loading deployment slots and live metrics...
            </div>
          ) : filteredDeployments.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="deployment" className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">No Deployments Found</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                {deployments.length === 0
                  ? "No models have been deployed to serving slots yet. Select a staging or production model to deploy."
                  : "No deployments match your current search or status filter."}
              </p>
              {deployableVersions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDeployModal(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Icon name="upload" className="h-3.5 w-3.5" />
                  Deploy Available Model
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg text-muted font-semibold uppercase tracking-wider border-b border-line">
                  <tr>
                    <th className="py-3 px-4">Model &amp; Version</th>
                    <th className="py-3 px-4">Serving Status</th>
                    <th className="py-3 px-4">Request Count &amp; Errors</th>
                    <th className="py-3 px-4">Latency (Avg / Max)</th>
                    <th className="py-3 px-4">Deployed At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {filteredDeployments.map((d) => {
                    const ver = versions.find((v) => v.id === d.model_version_id);
                    const isActive = d.status === "active";
                    // Check if there is an older deployment that this deployment replaced (for rollback)
                    const canRollback =
                      isActive && deployments.some((other) => other.replaced_by === d.id);

                    return (
                      <tr key={d.id} className="hover:bg-bg/50 transition-colors">
                        {/* Model & Version */}
                        <td className="py-3.5 px-4 font-medium text-ink">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{d.model_name}</span>
                            {ver && (
                              <span className="rounded bg-line/70 px-1.5 py-0.5 font-mono text-[11px] text-ink font-semibold">
                                v{ver.version}
                              </span>
                            )}
                            {ver?.lifecycle_state === "production" && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">
                                Champion
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-muted truncate max-w-xs">
                            ID: {d.id}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border capitalize ${
                              isActive
                                ? "bg-green-100 text-green-800 border-green-200"
                                : d.status === "stopped"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-line/60 text-muted border-line"
                            }`}
                          >
                            {isActive && <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />}
                            {d.status}
                          </span>
                          {d.replaced_by && (
                            <div className="mt-0.5 text-[10px] text-muted truncate max-w-xs">
                              Replaced by: {d.replaced_by.slice(0, 8)}...
                            </div>
                          )}
                        </td>

                        {/* Requests & Errors */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-ink">
                            {d.request_count.toLocaleString()} calls
                          </div>
                          <div
                            className={`text-[11px] ${
                              d.error_count > 0 ? "text-red-600 font-semibold" : "text-muted"
                            }`}
                          >
                            {d.error_count} errors{" "}
                            {d.request_count > 0
                              ? `(${((d.error_count / d.request_count) * 100).toFixed(1)}%)`
                              : ""}
                          </div>
                        </td>

                        {/* Latency */}
                        <td className="py-3.5 px-4">
                          {d.avg_latency_ms !== null ? (
                            <div>
                              <span className="font-semibold text-ink">{d.avg_latency_ms} ms</span>
                              <span className="text-[10px] text-muted block">
                                Max: {d.max_latency_ms} ms
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted italic">No traffic recorded</span>
                          )}
                        </td>

                        {/* Timestamps */}
                        <td className="py-3.5 px-4 text-muted">
                          <div>{new Date(d.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px]">{new Date(d.created_at).toLocaleTimeString()}</div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Test in Playground */}
                            {isActive && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInferenceDeployId(d.id);
                                  setActiveTab("inference");
                                }}
                                className="rounded px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1"
                              >
                                <Icon name="predictions" className="h-3.5 w-3.5" />
                                Predict
                              </button>
                            )}

                            {/* Details modal */}
                            <button
                              type="button"
                              onClick={() => setInspectDeployment(d)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-ink bg-bg hover:bg-line border border-line transition-colors"
                            >
                              Details
                            </button>

                            {/* Stop active */}
                            {isActive && (
                              <button
                                type="button"
                                onClick={() => setStopTarget(d)}
                                className="rounded px-2 py-1 text-xs font-medium text-amber hover:bg-amber/10 border border-amber/30 transition-colors"
                              >
                                Stop
                              </button>
                            )}

                            {/* Rollback */}
                            {canRollback && (
                              <button
                                type="button"
                                onClick={() => setRollbackTarget(d)}
                                className="rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
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
      ) : (
        /* Real-Time Inference Playground */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Request Editor (Left 7 Cols) */}
          <div className="space-y-4 lg:col-span-7">
            <Card>
              <CardHeader
                icon={<Icon name="predictions" className="h-5 w-5 text-primary" />}
                title="Single-Record JSON Inference Playground"
                subtitle="Sends real-time payloads directly to FastAPI serving endpoints with latency recording"
              />

              <form onSubmit={handleExecutePrediction} className="space-y-4">
                {/* Active Deployment Selector */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Target Deployment Slot
                  </label>
                  <select
                    value={selectedInferenceDeployId}
                    onChange={(e) => setSelectedInferenceDeployId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs font-medium text-ink focus:border-primary focus:outline-none"
                  >
                    {deployments.map((d) => {
                      const ver = versions.find((v) => v.id === d.model_version_id);
                      return (
                        <option key={d.id} value={d.id}>
                          {d.model_name} {ver ? `v${ver.version}` : ""} — Status: {d.status.toUpperCase()} (ID: {d.id.slice(0, 8)}...)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Schema / Feature Guidance */}
                {inputColsForActive.length > 0 && (
                  <div className="rounded-lg border border-line bg-bg p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">Required Model Input Features:</span>
                      <button
                        type="button"
                        onClick={handleFillSamplePayload}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Auto-fill Sample JSON
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {inputColsForActive.map((col) => (
                        <span
                          key={col}
                          className="rounded bg-surface px-2 py-0.5 text-[11px] font-mono text-ink border border-line shadow-xs"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* JSON Editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                      Request Payload (JSON)
                    </label>
                    <span className="text-[11px] font-mono text-muted">
                      POST /api/v1/deployments/{selectedInferenceDeployId ? selectedInferenceDeployId.slice(0, 8) : "..."}/predict
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={jsonInput}
                    onChange={(e) => {
                      setJsonInput(e.target.value);
                      setJsonError(null);
                    }}
                    className="w-full rounded-lg border border-line bg-bg p-3 font-mono text-xs text-ink focus:border-primary focus:outline-none"
                    placeholder='{"features": {"age": 30, "city": "NY"}}'
                  />
                  {jsonError && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{jsonError}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleFillSamplePayload}
                    className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg transition-colors"
                  >
                    Reset to Template
                  </button>
                  <button
                    type="submit"
                    disabled={predictLoading || !selectedInferenceDeployId}
                    className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {predictLoading ? (
                      <>
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Executing Inference...
                      </>
                    ) : (
                      <>
                        <Icon name="predictions" className="h-4 w-4" />
                        Execute Prediction
                      </>
                    )}
                  </button>
                </div>
              </form>
            </Card>
          </div>

          {/* Response Viewer (Right 5 Cols) */}
          <div className="space-y-4 lg:col-span-5">
            <Card className="h-full flex flex-col justify-between">
              <div>
                <CardHeader
                  icon={<Icon name="check-circle" className="h-5 w-5 text-green-600" />}
                  title="Inference Response"
                  subtitle="Live model output and execution latency"
                  action={
                    predictResult && (
                      <button
                        type="button"
                        onClick={handleCopyResponse}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {copiedResponse ? "Copied!" : "Copy JSON"}
                      </button>
                    )
                  }
                />

                {predictError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Icon name="alert-triangle" className="h-4 w-4 text-red-600" />
                      Prediction Failed
                    </div>
                    <p className="text-[11px] leading-relaxed">{predictError}</p>
                  </div>
                )}

                {predictResult && (
                  <div className="space-y-4">
                    {/* Prediction Output Card */}
                    <div className="rounded-lg border border-line bg-gradient-to-r from-bg to-surface p-4 text-center">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Predicted Value
                      </span>
                      <div className="mt-1 text-3xl font-extrabold text-primary">
                        {String(predictResult.prediction)}
                      </div>
                      <span className="text-[10px] font-mono text-muted">
                        Model Version v{predictResult.model_version}
                      </span>
                    </div>

                    {/* Latency & Info Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-line bg-bg p-3">
                        <span className="text-muted block text-[10px] uppercase">Latency</span>
                        <span className="text-base font-bold text-ink">
                          {predictResult.latency_ms.toFixed(3)} ms
                        </span>
                      </div>
                      <div className="rounded-lg border border-line bg-bg p-3">
                        <span className="text-muted block text-[10px] uppercase">Status</span>
                        <span className="text-base font-bold text-green-700 capitalize">
                          {predictResult.status}
                        </span>
                      </div>
                    </div>

                    {/* Raw JSON viewer */}
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                        Full Payload
                      </span>
                      <pre className="max-h-48 overflow-x-auto rounded-lg border border-line bg-bg p-3 text-[11px] font-mono text-ink">
                        {JSON.stringify(predictResult, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {!predictResult && !predictError && (
                  <div className="py-16 text-center text-xs text-muted">
                    <Icon name="predictions" className="mx-auto h-8 w-8 text-line mb-2" />
                    Enter input features and click &ldquo;Execute Prediction&rdquo; to test real-time serving.
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
                FastAPI direct pipeline serving (ADR-0005). Every request is logged to the deployment metrics store.
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Deploy Model Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-bold text-base text-ink">Deploy Model to Serving Slot</h3>
                <p className="text-xs text-muted">
                  Binds a verified staging or production model version to live inference.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeployModal(false);
                  setDeployingVersionId(null);
                }}
                className="text-muted hover:text-ink"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {deployError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <span className="font-semibold">Deployment Error:</span> {deployError}
              </div>
            )}

            {deployableVersions.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted space-y-3">
                <p>No model versions currently qualify for deployment.</p>
                <p className="text-[11px]">
                  Per deployment rules, models must be in <span className="font-semibold text-ink">staging</span> or{" "}
                  <span className="font-semibold text-ink">production</span> lifecycle states.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeployModal(false);
                    navigate("/registry");
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Go to Model Registry →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  Select Model Version to Deploy
                </label>
                <div className="max-h-60 overflow-y-auto divide-y divide-line rounded-lg border border-line">
                  {deployableVersions.map((v) => {
                    const isSelected = deployingVersionId === v.id;
                    const isProd = v.lifecycle_state === "production";

                    return (
                      <div
                        key={v.id}
                        onClick={() => setDeployingVersionId(v.id)}
                        className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-bg/60"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-ink">{v.model_name}</span>
                            <span className="rounded bg-line px-1.5 py-0.2 font-mono text-[10px] text-ink font-semibold">
                              v{v.version}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.2 text-[10px] font-semibold border capitalize ${
                                isProd ? "bg-green-100 text-green-800 border-green-200" : "bg-amber/15 text-amber border-amber/30"
                              }`}
                            >
                              {v.lifecycle_state}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted font-mono truncate max-w-sm">
                            ID: {v.id}
                          </div>
                        </div>

                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setDeployingVersionId(v.id)}
                          className="text-primary focus:ring-primary"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-line bg-bg p-3 text-xs text-muted leading-relaxed">
                  <span className="font-semibold text-ink">Deployment Replacement Policy:</span> Each model family holds at most one active serving deployment. Deploying this version will atomically supersede any active deployment for this model, archiving the previous deployment as the rollback target.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setShowDeployModal(false);
                  setDeployingVersionId(null);
                }}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg"
              >
                Cancel
              </button>
              {deployableVersions.length > 0 && (
                <button
                  type="button"
                  disabled={!deployingVersionId || deployBusy}
                  onClick={handleConfirmDeploy}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {deployBusy ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Deploying...
                    </>
                  ) : (
                    "Confirm Deployment"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deployment Details Inspection Modal */}
      {inspectDeployment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="deployment" className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-ink">{inspectDeployment.model_name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border capitalize ${
                        inspectDeployment.status === "active"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : inspectDeployment.status === "stopped"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-line/60 text-muted border-line"
                      }`}
                    >
                      {inspectDeployment.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-muted mt-0.5">Deployment ID: {inspectDeployment.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectDeployment(null)}
                className="text-muted hover:text-ink"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* Serving Performance Grid */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Live Serving Observability
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-line bg-bg p-3">
                  <span className="text-[10px] uppercase text-muted">Total Requests</span>
                  <div className="text-xl font-bold text-ink">{inspectDeployment.request_count}</div>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3">
                  <span className="text-[10px] uppercase text-muted">Error Count</span>
                  <div
                    className={`text-xl font-bold ${
                      inspectDeployment.error_count > 0 ? "text-red-600" : "text-ink"
                    }`}
                  >
                    {inspectDeployment.error_count}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3">
                  <span className="text-[10px] uppercase text-muted">Avg Latency</span>
                  <div className="text-xl font-bold text-ink">
                    {inspectDeployment.avg_latency_ms !== null
                      ? `${inspectDeployment.avg_latency_ms} ms`
                      : "N/A"}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3">
                  <span className="text-[10px] uppercase text-muted">Max Latency</span>
                  <div className="text-xl font-bold text-ink">
                    {inspectDeployment.max_latency_ms !== null
                      ? `${inspectDeployment.max_latency_ms} ms`
                      : "N/A"}
                  </div>
                </div>
              </div>
            </div>

            {/* Deployment Metadata Details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Bound Model Version ID</span>
                <p className="font-mono text-ink mt-0.5 truncate">{inspectDeployment.model_version_id}</p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Deployed At</span>
                <p className="font-medium text-ink mt-0.5">
                  {new Date(inspectDeployment.created_at).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Stopped / Superseded At</span>
                <p className="font-medium text-ink mt-0.5">
                  {inspectDeployment.stopped_at
                    ? new Date(inspectDeployment.stopped_at).toLocaleString()
                    : "Still active"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted">Replaced By</span>
                <p className="font-mono text-ink mt-0.5 truncate">
                  {inspectDeployment.replaced_by ?? "None"}
                </p>
              </div>
            </div>

            {/* Endpoint Integration Snippet */}
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                API Prediction Endpoint
              </span>
              <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 text-[11px] font-mono text-ink">
                POST /api/v1/deployments/{inspectDeployment.id}/predict
              </pre>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-between border-t border-line pt-4">
              <div className="flex items-center gap-2">
                {inspectDeployment.status === "active" && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectDeployment.id;
                      setInspectDeployment(null);
                      setSelectedInferenceDeployId(id);
                      setActiveTab("inference");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    <Icon name="predictions" className="h-3.5 w-3.5" />
                    Open in Playground
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setInspectDeployment(null);
                    navigate("/registry");
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg"
                >
                  View in Model Registry
                </button>
              </div>

              <button
                type="button"
                onClick={() => setInspectDeployment(null)}
                className="rounded-lg border border-line px-4 py-1.5 text-xs font-medium text-ink hover:bg-bg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {stopTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber/15 text-amber">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">Stop Model Serving</h3>
                <p className="text-xs text-muted">Halt active prediction traffic</p>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to stop serving deployment{" "}
              <span className="font-semibold text-ink">{stopTarget.model_name}</span> (ID: {stopTarget.id.slice(0, 8)}...)?
              Subsequent real-time prediction requests to this endpoint will be rejected.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={stopBusy}
                onClick={() => setStopTarget(null)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={stopBusy}
                onClick={handleConfirmStop}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {stopBusy ? "Stopping..." : "Confirm Stop"}
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
                <h3 className="font-bold text-base text-ink">Rollback Deployment</h3>
                <p className="text-xs text-muted">Restore previous serving deployment</p>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              This action will demote the currently active deployment for{" "}
              <span className="font-semibold text-ink">{rollbackTarget.model_name}</span> to superseded status and re-activate the previous deployment.
            </p>

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
                {rollbackBusy ? "Rolling back..." : "Confirm Rollback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}