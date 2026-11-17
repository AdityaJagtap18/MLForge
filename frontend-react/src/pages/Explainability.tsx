import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  ApiError,
  type ExplainResponse,
  type JobSummary,
  type ModelVersion,
} from "../api/types";
import { EChart } from "../components/charts/EChart";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

interface ModelOption {
  key: string;
  jobId: string;
  versionId?: string;
  versionNumber?: number;
  modelName: string;
  lifecycleState?: string;
  taskType?: string;
  targetCol?: string;
  datasetFilename?: string;
  createdAt: string;
  source: "registry" | "job";
}

export function Explainability() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { versionId?: string; jobId?: string } | null;

  // Core Data
  const [registryVersions, setRegistryVersions] = useState<ModelVersion[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Selected Model State
  const [selectedKey, setSelectedKey] = useState<string>("");

  // Explanation State
  const [explanationMap, setExplanationMap] = useState<Record<string, ExplainResponse>>({});
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [latestExplainedAt, setLatestExplainedAt] = useState<Record<string, string>>({});

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"both" | "chart" | "table">("both");

  // Load initial models and versions
  useEffect(() => {
    async function loadInitial() {
      setLoadingInitial(true);
      setInitialError(null);
      try {
        const [versions, allJobs] = await Promise.all([
          api.listRegistryVersions().catch(() => [] as ModelVersion[]),
          api.listJobs().catch(() => [] as JobSummary[]),
        ]);
        setRegistryVersions(versions);
        setJobs(allJobs);

        // Build eligible models list
        const eligibleJobs = allJobs.filter(
          (j) => j.status === "succeeded" && (j.job_type === "train" || j.job_type === "find_best")
        );

        // Check if routeState specified a target
        let targetKey = "";
        if (routeState?.versionId) {
          const matchedVer = versions.find((v) => v.id === routeState.versionId);
          if (matchedVer) {
            targetKey = `reg_${matchedVer.id}`;
          }
        } else if (routeState?.jobId) {
          const matchedVer = versions.find((v) => v.job_id === routeState.jobId);
          if (matchedVer) {
            targetKey = `reg_${matchedVer.id}`;
          } else {
            const matchedJob = eligibleJobs.find((j) => j.id === routeState.jobId);
            if (matchedJob) {
              targetKey = `job_${matchedJob.id}`;
            }
          }
        }

        // Default to first production version, first registry version, or first job
        if (!targetKey) {
          const prod = versions.find((v) => v.lifecycle_state === "production");
          if (prod) {
            targetKey = `reg_${prod.id}`;
          } else if (versions.length > 0) {
            targetKey = `reg_${versions[0].id}`;
          } else if (eligibleJobs.length > 0) {
            targetKey = `job_${eligibleJobs[0].id}`;
          }
        }

        setSelectedKey(targetKey);
      } catch (err) {
        setInitialError(err instanceof ApiError ? err.message : "Failed to load models for explainability.");
      } finally {
        setLoadingInitial(false);
      }
    }

    loadInitial();
  }, [routeState]);

  // Unified list of selectable models
  const modelOptions = useMemo<ModelOption[]>(() => {
    const list: ModelOption[] = [];
    const jobMap = new Map<string, JobSummary>();
    jobs.forEach((j) => jobMap.set(j.id, j));

    // 1. Registered model versions (authoritative)
    registryVersions.forEach((ver) => {
      const associatedJob = jobMap.get(ver.job_id);
      list.push({
        key: `reg_${ver.id}`,
        jobId: ver.job_id,
        versionId: ver.id,
        versionNumber: ver.version,
        modelName: ver.model_name,
        lifecycleState: ver.lifecycle_state,
        taskType: associatedJob?.task_type || ver.model_card?.task_type || undefined,
        targetCol: ver.model_card?.target_col || undefined,
        datasetFilename: associatedJob?.dataset_filename || ver.model_card?.dataset_filename || undefined,
        createdAt: ver.created_at,
        source: "registry",
      });
    });

    // 2. Unregistered completed training jobs
    const registeredJobIds = new Set(registryVersions.map((v) => v.job_id));
    jobs
      .filter((j) => j.status === "succeeded" && !registeredJobIds.has(j.id))
      .forEach((j) => {
        list.push({
          key: `job_${j.id}`,
          jobId: j.id,
          modelName: j.model_name || "Completed Training Run",
          taskType: j.task_type || undefined,
          datasetFilename: j.dataset_filename || undefined,
          createdAt: j.created_at,
          source: "job",
        });
      });

    return list;
  }, [registryVersions, jobs]);

  // Selected Model Object
  const selectedModel = useMemo(() => {
    return modelOptions.find((m) => m.key === selectedKey) || null;
  }, [modelOptions, selectedKey]);

  // Fetch or retrieve explanation when selected model changes
  useEffect(() => {
    if (!selectedModel) return;

    const currentJobId = selectedModel.jobId;
    if (explanationMap[currentJobId]) {
      // Already cached
      setExplainError(null);
      return;
    }

    async function fetchExplanation() {
      setLoadingExplain(true);
      setExplainError(null);
      try {
        const res = await api.explainJob(currentJobId);
        setExplanationMap((prev) => ({ ...prev, [currentJobId]: res }));
        setLatestExplainedAt((prev) => ({ ...prev, [currentJobId]: new Date().toISOString() }));
      } catch (err) {
        setExplainError(err instanceof ApiError ? err.message : "Failed to compute model explanation.");
      } finally {
        setLoadingExplain(false);
      }
    }

    fetchExplanation();
  }, [selectedModel]);

  // Current explanation
  const currentExplanation = selectedModel ? explanationMap[selectedModel.jobId] : null;

  // Refresh current model explanation
  async function handleRefreshExplanation() {
    if (!selectedModel) return;
    const currentJobId = selectedModel.jobId;
    setLoadingExplain(true);
    setExplainError(null);
    try {
      const res = await api.explainJob(currentJobId);
      setExplanationMap((prev) => ({ ...prev, [currentJobId]: res }));
      setLatestExplainedAt((prev) => ({ ...prev, [currentJobId]: new Date().toISOString() }));
    } catch (err) {
      setExplainError(err instanceof ApiError ? err.message : "Failed to refresh model explanation.");
    } finally {
      setLoadingExplain(false);
    }
  }

  // Filtered model options for dropdown / list
  const filteredModels = useMemo(() => {
    return modelOptions.filter((m) => {
      if (lifecycleFilter !== "all" && m.lifecycleState !== lifecycleFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.modelName.toLowerCase().includes(q);
        const matchJob = m.jobId.toLowerCase().includes(q);
        const matchTask = m.taskType ? m.taskType.toLowerCase().includes(q) : false;
        if (!matchName && !matchJob && !matchTask) return false;
      }
      return true;
    });
  }, [modelOptions, lifecycleFilter, searchQuery]);

  // Overview KPIs calculation
  const overviewKpis = useMemo(() => {
    const totalEligible = modelOptions.length;

    let supportedCount = 0;
    let unsupportedCount = 0;
    let missingDataCount = 0;

    // Check cached explanations and heuristic compatibility
    modelOptions.forEach((m) => {
      const exp = explanationMap[m.jobId];
      if (exp) {
        if (exp.supported) {
          supportedCount++;
        } else if (exp.message && exp.message.toLowerCase().includes("dataset")) {
          missingDataCount++;
        } else {
          unsupportedCount++;
        }
      } else {
        // Known compatibility heuristic
        if (!m.datasetFilename) {
          missingDataCount++;
        } else if (m.modelName.toLowerCase().includes("neighbour") || m.modelName.toLowerCase().includes("knn")) {
          unsupportedCount++;
        }
      }
    });

    // Find most recent explanation timestamp
    const explanationTimestamps = Object.values(latestExplainedAt);
    let mostRecentTime: string | null = null;
    if (explanationTimestamps.length > 0) {
      explanationTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      mostRecentTime = explanationTimestamps[0];
    }

    return {
      totalEligible,
      supportedCount,
      unsupportedCount,
      missingDataCount,
      mostRecentTime,
    };
  }, [modelOptions, explanationMap, latestExplainedAt]);

  // Feature Importance Data formatting
  const sortedFeatures = useMemo(() => {
    if (!currentExplanation || !currentExplanation.global_importance) return [];
    const entries = Object.entries(currentExplanation.global_importance);
    // Backend already sorts descending, but ensure sorted
    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, curr) => acc + curr[1], 0);

    return entries.map(([name, val], index) => {
      const cleanName = name.replace(/^(numeric__|categorical__|num__|cat__)/, "");
      const prefix = name.startsWith("numeric__") || name.startsWith("num__")
        ? "num"
        : name.startsWith("categorical__") || name.startsWith("cat__")
        ? "cat"
        : null;
      const relativePct = total > 0 ? (val / total) * 100 : 0;

      return {
        rank: index + 1,
        rawName: name,
        cleanName,
        prefix,
        value: val,
        relativePct,
      };
    });
  }, [currentExplanation]);

  const totalImportance = useMemo(() => {
    return sortedFeatures.reduce((acc, f) => acc + f.value, 0);
  }, [sortedFeatures]);

  // ECharts Horizontal Bar Chart Configuration
  const chartOption = useMemo<EChartsOption>(() => {
    if (sortedFeatures.length === 0) return {};

    // Take top 15 features for clean display if there are many
    const displayFeatures = sortedFeatures.slice(0, 15);
    const maxNameLen = Math.max(...displayFeatures.map((f) => f.cleanName.length));
    const leftMargin = Math.min(200, Math.max(100, maxNameLen * 8 + 20));

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#FFFFFF",
        borderColor: "#EAE4DC",
        borderWidth: 1,
        textStyle: { color: "#242424", fontSize: 12 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const rawVal = typeof p.value === "number" ? p.value.toFixed(4) : p.value;
          const feature = sortedFeatures.find((f) => f.cleanName === p.name);
          const pct = feature ? feature.relativePct.toFixed(1) : "—";
          return `
            <div style="font-family: inherit; line-height: 1.5;">
              <div style="font-weight: 600; color: #242424; margin-bottom: 4px;">${p.name}</div>
              <div style="color: #77716B; font-size: 11px;">Mean |SHAP| Value: <strong style="color: #242424;">${rawVal}</strong></div>
              <div style="color: #77716B; font-size: 11px;">Relative Contribution: <strong style="color: #E96B18;">${pct}%</strong></div>
            </div>
          `;
        },
      },
      grid: {
        left: leftMargin,
        right: 48,
        top: 20,
        bottom: 30,
      },
      xAxis: {
        type: "value",
        name: "mean(|SHAP value|)",
        nameLocation: "middle",
        nameGap: 24,
        nameTextStyle: { color: "#77716B", fontSize: 11 },
        splitLine: { lineStyle: { color: "#F3EFEA" } },
        axisLabel: { color: "#77716B", fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: displayFeatures.map((f) => f.cleanName).reverse(),
        axisLabel: {
          color: "#242424",
          fontSize: 11,
          fontWeight: 500,
        },
        axisLine: { lineStyle: { color: "#EAE4DC" } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: displayFeatures.map((f) => f.value).reverse(),
          itemStyle: {
            color: "#E96B18",
            borderRadius: [0, 4, 4, 0],
          },
          barMaxWidth: 20,
          label: {
            show: true,
            position: "right",
            formatter: (p: any) => (typeof p.value === "number" ? p.value.toFixed(4) : String(p.value)),
            color: "#77716B",
            fontSize: 10,
          },
        },
      ],
    };
  }, [sortedFeatures]);

  // Chart height dynamically scales with number of features
  const chartHeight = useMemo(() => {
    const count = Math.min(sortedFeatures.length, 15);
    return Math.max(260, count * 28 + 60);
  }, [sortedFeatures]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="explainability" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-ink">Model Explainability</h1>
              <p className="text-sm text-muted">
                Global SHAP feature contribution analysis, importance rankings, and algorithm interpretability
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/registry")}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-xs"
          >
            <Icon name="model-registry" className="h-4 w-4 text-muted" />
            Model Registry &rarr;
          </button>
          <button
            type="button"
            onClick={handleRefreshExplanation}
            disabled={loadingExplain || !selectedModel}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-xs disabled:opacity-50"
            title="Re-compute or refresh SHAP explanation for the selected model"
          >
            <Icon name="clock" className={`h-4 w-4 ${loadingExplain ? "animate-spin text-primary" : "text-muted"}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {initialError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-4 w-4 flex-shrink-0" />
            <span>{initialError}</span>
          </div>
          <button onClick={() => setInitialError(null)} className="font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: Explainability Overview KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {/* Total Eligible Models */}
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Eligible Models</span>
            <Icon name="database" className="h-4 w-4 text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink">{overviewKpis.totalEligible}</span>
            <span className="text-xs text-muted">available</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Trained models with artifacts</p>
        </div>

        {/* Verified Supported */}
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">SHAP Supported</span>
            <div className="rounded bg-green-50 p-1 text-green-700">
              <Icon name="check-circle" className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-green-700">{overviewKpis.supportedCount}</span>
            <span className="text-xs text-muted">computed</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Tree/Linear models verified</p>
        </div>

        {/* Unsupported Algorithms */}
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Unsupported Models</span>
            <div className="rounded bg-amber/15 p-1 text-amber">
              <Icon name="alert-triangle" className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-amber">{overviewKpis.unsupportedCount}</span>
            <span className="text-xs text-muted">flagged</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">e.g. Distance-based (KNN)</p>
        </div>

        {/* Missing Dataset / Data Needed */}
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Data Unavailable</span>
            <Icon name="filter" className="h-4 w-4 text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink">{overviewKpis.missingDataCount}</span>
            <span className="text-xs text-muted">models</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Requires original dataset</p>
        </div>

        {/* Method & Scope */}
        <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Method &amp; Scope</span>
            <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              ADR-0004
            </span>
          </div>
          <div className="mt-2 text-sm font-bold text-ink">Global SHAP</div>
          <p className="mt-1 text-[11px] text-muted">100-sample mean(|SHAP|)</p>
        </div>
      </div>

      {/* SECTION 2: Model Selector & Context Banner */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Model Selector Dropdown & Filter */}
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-64 flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                Target Model Version
              </label>
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs font-medium text-ink focus:border-primary focus:outline-none"
              >
                {filteredModels.length === 0 ? (
                  <option value="" disabled>
                    No models match filter
                  </option>
                ) : (
                  filteredModels.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.source === "registry"
                        ? `${opt.modelName} v${opt.versionNumber} (${opt.lifecycleState})`
                        : `${opt.modelName} (Training Job ${opt.jobId.slice(0, 8)})`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Lifecycle Stage Filter */}
            <div className="w-full sm:w-40">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                Stage Filter
              </label>
              <select
                value={lifecycleFilter}
                onChange={(e) => setLifecycleFilter(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
              >
                <option value="all">All Stages</option>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="w-full sm:w-56">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                Search Models
              </label>
              <div className="relative">
                <Icon name="search" className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted" />
                <input
                  type="text"
                  placeholder="Filter by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg pl-8 pr-3 py-2 text-xs text-ink placeholder-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right: Selected Model Quick Badge */}
          {selectedModel && (
            <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t border-line lg:border-t-0">
              {selectedModel.lifecycleState && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    selectedModel.lifecycleState === "production"
                      ? "bg-green-100 text-green-800 border-green-200"
                      : selectedModel.lifecycleState === "staging"
                      ? "bg-amber/15 text-amber border-amber/30"
                      : selectedModel.lifecycleState === "development"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-line/60 text-muted border-line"
                  }`}
                >
                  {selectedModel.lifecycleState}
                </span>
              )}
              {selectedModel.taskType && (
                <span className="rounded bg-line px-2 py-0.5 text-xs font-medium uppercase text-muted">
                  {selectedModel.taskType}
                </span>
              )}
              <span className="font-mono text-xs text-muted">
                job: {selectedModel.jobId.slice(0, 8)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Main Content Area */}
      {loadingInitial ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center text-muted">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary mb-3"></div>
          <p className="text-sm font-medium text-ink">Loading models and registry versions...</p>
        </div>
      ) : !selectedModel ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center text-muted">
          <Icon name="explainability" className="mx-auto h-12 w-12 text-muted/60 mb-3" />
          <h3 className="text-base font-semibold text-ink">No Model Selected</h3>
          <p className="mt-1 text-xs text-muted max-w-md mx-auto">
            Select a trained or registered model to inspect global feature importance and SHAP contributions.
          </p>
          <button
            type="button"
            onClick={() => navigate("/train")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Train a Model
          </button>
        </div>
      ) : loadingExplain ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center text-muted">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary mb-3"></div>
          <p className="text-sm font-medium text-ink">Computing SHAP values for {selectedModel.modelName}...</p>
          <p className="mt-1 text-xs text-muted">
            Evaluating tree and linear feature attributions against a sample of the training dataset.
          </p>
        </div>
      ) : explainError ? (
        <div className="rounded-card border border-red-200 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3">
            <Icon name="alert-triangle" className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">Failed to Compute Explanation</h3>
              <p className="text-xs">{explainError}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleRefreshExplanation}
              className="rounded border border-red-300 bg-surface px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate("/registry")}
              className="rounded border border-transparent px-3 py-1.5 text-xs text-red-700 hover:underline"
            >
              Back to Registry
            </button>
          </div>
        </div>
      ) : currentExplanation && !currentExplanation.supported ? (
        /* SECTION 4: Unsupported Model Guidance */
        <div className="space-y-6">
          <Card className="border-amber/30 bg-amber/5">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-amber/20 p-2.5 text-amber flex-shrink-0">
                <Icon name="alert-triangle" className="h-6 w-6" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">
                    SHAP Explainability Unavailable for this Model
                  </h3>
                  <span className="rounded bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-amber uppercase">
                    Unsupported Estimator
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed font-mono bg-surface p-3 rounded-lg border border-line">
                  {currentExplanation.message || "SHAP does not support this model type out of the box."}
                </p>
                <div className="text-xs text-muted space-y-1.5 pt-2">
                  <p className="font-semibold text-ink">Technical Explanation:</p>
                  <p className="leading-relaxed">
                    MLForge uses SHAP's analytical <code>Explainer</code> (optimally utilizing <code>TreeExplainer</code>{" "}
                    for decision trees/random forests and <code>LinearExplainer</code> for linear models).
                  </p>
                  <p className="leading-relaxed">
                    Distance-based algorithms (such as K-Nearest Neighbors) or non-linear kernel models do not expose
                    analytical gradients or tree splits. Explaining them requires model-agnostic kernel estimations
                    (KernelExplainer), which involve substantial combinatorial sampling and are not enabled by default.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
              <div className="text-xs text-muted">
                Need interpretability? Train an alternative tree-based or linear model.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/train")}
                  className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Train Random Forest / Logistic Regression &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/registry")}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg transition-colors"
                >
                  Return to Registry
                </button>
              </div>
            </div>
          </Card>

          {/* Model Technical Context Box */}
          <Card>
            <CardHeader
              title="Model Information & Metadata"
              subtitle="Registered configuration for the selected unexplainable model artifact"
            />
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Model Algorithm</span>
                <span className="font-semibold text-ink mt-0.5 block">{selectedModel.modelName}</span>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Lifecycle Stage</span>
                <span className="font-semibold text-ink mt-0.5 block capitalize">
                  {selectedModel.lifecycleState || "Development"}
                </span>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Task Type</span>
                <span className="font-semibold text-ink mt-0.5 block uppercase">
                  {selectedModel.taskType || "Classification"}
                </span>
              </div>
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Associated Job ID</span>
                <span className="font-mono text-ink mt-0.5 block truncate">{selectedModel.jobId}</span>
              </div>
            </div>
          </Card>
        </div>
      ) : currentExplanation && currentExplanation.supported ? (
        /* SECTION 5: Supported Global SHAP Feature Importance */
        <div className="space-y-6">
          {/* Methodology & Causation Disclaimer Card */}
          <div className="rounded-card border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/20 p-1.5 text-primary flex-shrink-0 mt-0.5">
                <Icon name="chart" className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-ink">
                  Interpretability Note: Empirical Contribution vs. Causality
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {currentExplanation.message ||
                    "Values are mean(|SHAP value|) per feature: how much each feature contributed to this model's predictions on a sample of the training data. This reflects the model's learned behavior, not a causal relationship in the real world."}
                </p>
                <p className="text-[11px] text-muted leading-relaxed">
                  Global feature importance represents the aggregate magnitude of feature influence across a 100-sample
                  slice of training data. High SHAP value indicates that the model relies heavily on that feature to form
                  predictions, but does not imply that intervening on that feature in reality will cause the outcome to change.
                </p>
              </div>
            </div>
          </div>

          {/* Feature Importance Presentation */}
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 mb-4">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Global Feature Importance Ranking</h3>
                <p className="text-xs text-muted">
                  Mean absolute SHAP value: mean(|SHAP|) describing average model prediction contribution
                </p>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-line bg-bg p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("both")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "both" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  Split View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("chart")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "chart" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  Chart Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    viewMode === "table" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  Table Only
                </button>
              </div>
            </div>

            {/* Visual Chart and/or Table */}
            <div className={`grid gap-6 ${viewMode === "both" ? "lg:grid-cols-12" : "grid-cols-1"}`}>
              {/* Horizontal Bar Chart */}
              {(viewMode === "both" || viewMode === "chart") && (
                <div className={viewMode === "both" ? "lg:col-span-7" : "w-full"}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Feature Contribution Chart (Top 15)
                    </span>
                    <span className="text-[11px] text-muted font-mono">
                      {sortedFeatures.length} total features
                    </span>
                  </div>
                  <div className="rounded-lg border border-line bg-bg/50 p-2">
                    <EChart option={chartOption} height={chartHeight} />
                  </div>
                </div>
              )}

              {/* Tabular Ranking */}
              {(viewMode === "both" || viewMode === "table") && (
                <div className={viewMode === "both" ? "lg:col-span-5" : "w-full"}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Ranked Importance Table
                    </span>
                    <span className="text-[11px] text-muted">
                      Total |SHAP| Sum: {totalImportance.toFixed(4)}
                    </span>
                  </div>
                  <div className="max-h-[460px] overflow-y-auto rounded-lg border border-line">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-bg text-muted uppercase text-[10px] font-semibold sticky top-0 border-b border-line">
                        <tr>
                          <th className="py-2 px-3 w-10">Rank</th>
                          <th className="py-2 px-3">Feature</th>
                          <th className="py-2 px-3 text-right">Mean |SHAP|</th>
                          <th className="py-2 px-3 text-right">Relative</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line font-sans">
                        {sortedFeatures.map((feat) => (
                          <tr key={feat.rawName} className="hover:bg-bg/60 transition-colors">
                            <td className="py-2 px-3 text-muted font-semibold">#{feat.rank}</td>
                            <td className="py-2 px-3">
                              <div className="font-medium text-ink flex items-center gap-1.5">
                                <span className="font-mono">{feat.cleanName}</span>
                                {feat.prefix && (
                                  <span className="rounded bg-line/80 px-1 py-0.2 text-[9px] font-mono text-muted uppercase">
                                    {feat.prefix}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-ink">
                              {feat.value.toFixed(4)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-[11px] font-medium text-muted">
                                  {feat.relativePct.toFixed(1)}%
                                </span>
                                <div className="w-12 bg-line rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-primary h-1.5 rounded-full"
                                    style={{ width: `${Math.min(feat.relativePct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* SECTION 6: Model & Explanation Details Inspection */}
          <Card>
            <CardHeader
              title="Model &amp; Explanation Metadata"
              subtitle="Inspection parameters, dataset lineage, and runtime environment details"
            />

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Model Identity</span>
                <span className="font-semibold text-ink mt-0.5 block">
                  {selectedModel.modelName}
                  {selectedModel.versionNumber && (
                    <span className="ml-1 text-primary font-mono text-[11px]">
                      v{selectedModel.versionNumber}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted capitalize block mt-0.5">
                  State: {selectedModel.lifecycleState || "Development"}
                </span>
              </div>

              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Explanation Method</span>
                <span className="font-semibold text-ink mt-0.5 block">SHAP Explainer</span>
                <span className="text-[10px] text-muted block mt-0.5">
                  TreeExplainer / LinearExplainer
                </span>
              </div>

              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Sample Size Analyzed</span>
                <span className="font-semibold text-ink mt-0.5 block">100 rows</span>
                <span className="text-[10px] text-muted block mt-0.5">
                  Random sample (seed=42)
                </span>
              </div>

              <div className="rounded-lg border border-line bg-bg p-3">
                <span className="text-muted block text-[11px]">Features Processed</span>
                <span className="font-semibold text-ink mt-0.5 block">
                  {sortedFeatures.length} features
                </span>
                <span className="text-[10px] text-muted block mt-0.5">
                  After pipeline transformations
                </span>
              </div>
            </div>

            {/* Lineage & Actions Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Icon name="database" className="h-4 w-4 text-muted" />
                <span>
                  Training Dataset:{" "}
                  <code className="text-ink font-mono">
                    {selectedModel.datasetFilename || "Embedded in pipeline"}
                  </code>
                </span>
                <span className="text-line">&bull;</span>
                <span>
                  Job ID: <code className="text-ink font-mono">{selectedModel.jobId}</code>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/registry")}
                  className="rounded-lg border border-line bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition-colors"
                >
                  View in Model Registry &rarr;
                </button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
