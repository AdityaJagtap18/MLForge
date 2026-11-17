import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ApiError, type OverviewStatsResponse } from "../api/types";
import { EChart } from "../components/charts/EChart";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

function formatDayLabel(dateStr: string): string {
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return `${monthNames[m]} ${d}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const stats = await api.getOverviewStats();
      setData(stats);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load operational overview metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  // 1. Training Activity ECharts Option
  const trainingActivityOption = useMemo<EChartsOption>(() => {
    if (!data || data.training_activity.length === 0) return {};

    const dates = data.training_activity.map((p) => formatDayLabel(p.date));
    const counts = data.training_activity.map((p) => p.count);

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "#FFFFFF",
        borderColor: "#EAE4DC",
        borderWidth: 1,
        textStyle: { color: "#242424", fontSize: 12 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<strong>${p.name}</strong><br/>Training Runs: <b>${p.value}</b>`;
        },
      },
      grid: { left: 36, right: 16, top: 20, bottom: 24 },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#EAE4DC" } },
        axisLabel: { color: "#77716B", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: "#F3EFEA" } },
        axisLabel: { color: "#77716B", fontSize: 10 },
      },
      series: [
        {
          type: "line",
          data: counts,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: "#E96B18", width: 2 },
          itemStyle: { color: "#E96B18" },
          areaStyle: { color: "rgba(233,107,24,0.12)" },
        },
      ],
    };
  }, [data]);

  // 2. Model Performance ECharts Option
  const modelPerformanceOption = useMemo<EChartsOption>(() => {
    if (!data || data.model_performance.length === 0) return {};

    const sorted = [...data.model_performance].reverse();
    const modelLabels = sorted.map((m) =>
      m.version ? `${m.model_name} v${m.version}` : m.model_name
    );
    const scores = sorted.map((m) => Number(m.metric_value.toFixed(4)));

    const maxVal = Math.max(...scores, 1.0);
    const minVal = Math.min(...scores, 0.0);
    const xMin = Math.max(0, Math.floor((minVal - 0.1) * 10) / 10);
    const xMax = Math.min(1.0, Math.ceil((maxVal + 0.05) * 10) / 10);

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "#FFFFFF",
        borderColor: "#EAE4DC",
        borderWidth: 1,
        textStyle: { color: "#242424", fontSize: 12 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const point = sorted[p.dataIndex];
          return `
            <strong>${point.model_name}</strong> ${point.version ? `v${point.version}` : ""}<br/>
            Stage: <span style="text-transform: capitalize;">${point.stage || "job"}</span><br/>
            ${point.metric_name}: <b>${p.value}</b>
          `;
        },
      },
      grid: { left: 140, right: 40, top: 16, bottom: 24 },
      xAxis: {
        type: "value",
        min: xMin,
        max: xMax,
        splitLine: { lineStyle: { color: "#F3EFEA" } },
        axisLabel: { color: "#77716B", fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: modelLabels,
        axisLine: { lineStyle: { color: "#EAE4DC" } },
        axisLabel: { color: "#242424", fontSize: 11, fontWeight: 500 },
      },
      series: [
        {
          type: "bar",
          data: scores,
          itemStyle: { color: "#E96B18", borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            formatter: (p: any) => String(p.value),
            color: "#77716B",
            fontSize: 10,
          },
          barWidth: 18,
        },
      ],
    };
  }, [data]);

  // Compute Total Training Runs in Activity Window
  const totalActivityRuns = useMemo(() => {
    if (!data) return 0;
    return data.training_activity.reduce((acc, curr) => acc + curr.count, 0);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-ink">Overview</h1>
          <p className="text-sm text-muted">
            Live operational control plane: real-time telemetry across datasets, models, serving slots, and data drift
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted">
              Updated {lastUpdated}
            </span>
          )}
          <button
            type="button"
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-xs disabled:opacity-50"
          >
            <Icon name="clock" className={`h-4 w-4 ${loading ? "animate-spin text-primary" : "text-muted"}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <div className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadOverview}
            className="font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="rounded-card border border-line bg-surface p-12 text-center text-muted">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary mb-3"></div>
          <p className="text-sm font-medium text-ink">Aggregating live operational metrics...</p>
        </div>
      )}

      {data && (
        <>
          {/* SECTION 1: 5 Real Operational KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Datasets */}
            <Card
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate("/datasets")}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="datasets" className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted">Unique Datasets</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {data.experiments.unique_datasets}
              </div>
              <div className="mt-1 text-xs text-muted">Active in workspace</div>
            </Card>

            {/* Experiments */}
            <Card
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate("/experiments")}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="experiments" className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted">Total Experiments</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {data.experiments.total}
              </div>
              <div className="mt-1 text-xs text-muted">
                {data.experiments.active > 0 ? (
                  <span className="text-primary font-semibold">
                    {data.experiments.active} running / pending
                  </span>
                ) : (
                  `${data.experiments.succeeded} completed runs`
                )}
              </div>
            </Card>

            {/* Registered Models */}
            <Card
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate("/registry")}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="model-registry" className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted">Registered Models</div>
              <div className="mt-1 text-2xl font-bold text-ink">
                {data.models.total_registered}
              </div>
              <div className="mt-1 text-xs text-muted truncate" title={data.models.production_champion || undefined}>
                {data.models.production_champion ? (
                  <span className="text-green-700 font-medium">
                    Champ: {data.models.production_champion}
                  </span>
                ) : (
                  `${data.models.by_stage.staging} staging · ${data.models.by_stage.development} dev`
                )}
              </div>
            </Card>

            {/* Deployed Serving Slots */}
            <Card
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate("/deployments")}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="deployment" className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted">Active Deployments</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ink">{data.deployments.active}</span>
                <span className="text-xs text-muted">/ {data.deployments.total} slots</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {data.deployments.stopped} stopped · {data.deployments.replaced} replaced
              </div>
            </Card>

            {/* Drift Alerts */}
            <Card
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate("/monitoring")}
            >
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    data.drift_alerts.active > 0
                      ? "bg-red-50 text-red-600"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  <Icon name={data.drift_alerts.active > 0 ? "alert-triangle" : "check-circle"} className="h-5 w-5" />
                </div>
                {data.drift_alerts.active > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    ACTION REQ
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">Drift Alerts</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${
                    data.drift_alerts.active > 0 ? "text-red-600" : "text-ink"
                  }`}
                >
                  {data.drift_alerts.total}
                </span>
                <span className="text-xs text-muted">total</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {data.drift_alerts.active} active · {data.drift_alerts.resolved} resolved
              </div>
            </Card>
          </div>

          {/* SECTION 2: Model Lifecycle Breakdown */}
          {data.models.total_registered > 0 && (
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="model-registry" className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Model Version Lifecycle Distribution
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-muted">Production:</span>
                    <strong className="text-ink">{data.models.by_stage.production}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber" />
                    <span className="text-muted">Staging:</span>
                    <strong className="text-ink">{data.models.by_stage.staging}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-muted">Development:</span>
                    <strong className="text-ink">{data.models.by_stage.development}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted" />
                    <span className="text-muted">Archived:</span>
                    <strong className="text-ink">{data.models.by_stage.archived}</strong>
                  </span>
                </div>
              </div>

              {/* Stacked Progress Bar */}
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-line">
                {data.models.by_stage.production > 0 && (
                  <div
                    className="bg-green-500"
                    style={{
                      width: `${(data.models.by_stage.production / data.models.total_registered) * 100}%`,
                    }}
                    title={`Production: ${data.models.by_stage.production}`}
                  />
                )}
                {data.models.by_stage.staging > 0 && (
                  <div
                    className="bg-amber"
                    style={{
                      width: `${(data.models.by_stage.staging / data.models.total_registered) * 100}%`,
                    }}
                    title={`Staging: ${data.models.by_stage.staging}`}
                  />
                )}
                {data.models.by_stage.development > 0 && (
                  <div
                    className="bg-blue-500"
                    style={{
                      width: `${(data.models.by_stage.development / data.models.total_registered) * 100}%`,
                    }}
                    title={`Development: ${data.models.by_stage.development}`}
                  />
                )}
                {data.models.by_stage.archived > 0 && (
                  <div
                    className="bg-muted"
                    style={{
                      width: `${(data.models.by_stage.archived / data.models.total_registered) * 100}%`,
                    }}
                    title={`Archived: ${data.models.by_stage.archived}`}
                  />
                )}
              </div>
            </Card>
          )}

          {/* SECTION 3: Charts & System Health */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Real Training Activity Chart */}
            <Card className="lg:col-span-2">
              <CardHeader
                icon={<Icon name="experiments" className="h-5 w-5 text-primary" />}
                title="Training Activity"
                subtitle="Live database records — daily model training runs (last 14 days)"
              />
              {totalActivityRuns > 0 ? (
                <EChart option={trainingActivityOption} />
              ) : (
                <div className="flex h-[260px] flex-col items-center justify-center text-center text-muted">
                  <Icon name="experiments" className="h-10 w-10 text-muted/40 mb-2" />
                  <p className="text-xs">No training activity recorded in the last 14 days.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/train")}
                    className="mt-3 text-xs font-semibold text-primary hover:underline"
                  >
                    Start a training run &rarr;
                  </button>
                </div>
              )}
            </Card>

            {/* Real Model Performance Chart */}
            <Card className="lg:col-span-2">
              <CardHeader
                icon={<Icon name="chart" className="h-5 w-5 text-primary" />}
                title="Model Performance"
                subtitle="Authoritative primary metrics from registered versions &amp; latest runs"
              />
              {data.model_performance.length > 0 ? (
                <EChart option={modelPerformanceOption} />
              ) : (
                <div className="flex h-[260px] flex-col items-center justify-center text-center text-muted">
                  <Icon name="chart" className="h-10 w-10 text-muted/40 mb-2" />
                  <p className="text-xs">No model metrics recorded yet.</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    Train and evaluate models to view performance comparisons.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/train")}
                    className="mt-3 text-xs font-semibold text-primary hover:underline"
                  >
                    Train a model &rarr;
                  </button>
                </div>
              )}
            </Card>

            {/* Real System Health Card */}
            <Card className="lg:col-span-1">
              <CardHeader
                icon={<Icon name="monitoring" className="h-5 w-5 text-primary" />}
                title="System Health"
                subtitle="Live infrastructure checks"
              />
              <ul className="space-y-3.5 text-xs">
                {/* API Service */}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <Icon name="check-circle" className="h-4 w-4 text-green-600" />
                    API Control Plane
                  </span>
                  <span className="rounded bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {data.system_health.api === "ok" ? "Operational" : "Degraded"}
                  </span>
                </li>

                {/* Database */}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <Icon name="database" className="h-4 w-4 text-primary" />
                    PostgreSQL / SQLite
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      data.system_health.database === "ok"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {data.system_health.database === "ok" ? "Connected" : "Unreachable"}
                  </span>
                </li>

                {/* Model Catalog */}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <Icon name="model-registry" className="h-4 w-4 text-primary" />
                    Model Catalog
                  </span>
                  <span className="rounded bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {data.system_health.model_catalog === "ok" ? "Loaded" : "Unavailable"}
                  </span>
                </li>

                {/* MLflow */}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <Icon name="experiments" className="h-4 w-4 text-primary" />
                    MLflow Tracking
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      data.system_health.mlflow === "ok"
                        ? "bg-green-50 text-green-700"
                        : "bg-line/60 text-muted"
                    }`}
                  >
                    {data.system_health.mlflow === "ok" ? "Operational" : "Unavailable"}
                  </span>
                </li>

                {/* Evidently Monitoring */}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <Icon name="monitoring" className="h-4 w-4 text-primary" />
                    Evidently Engine
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      data.system_health.monitoring === "ok"
                        ? "bg-green-50 text-green-700"
                        : "bg-line/60 text-muted"
                    }`}
                  >
                    {data.system_health.monitoring === "ok" ? "Ready" : "Unavailable"}
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          {/* SECTION 4: Recent Experiments & Live Drift Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Recent Experiments Table */}
            <Card className="lg:col-span-3">
              <CardHeader
                icon={<Icon name="experiments" className="h-5 w-5 text-primary" />}
                title="Recent Experiments"
                subtitle="Latest training runs and model results"
                action={
                  <button
                    type="button"
                    onClick={() => navigate("/logs")}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View All Logs <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase text-[10px] font-semibold">
                      <th className="py-2.5 px-3">Job ID</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Task</th>
                      <th className="py-2.5 px-3 text-right">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.recent_jobs.slice(0, 5).map((j) => (
                      <tr key={j.id} className="hover:bg-bg/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-primary">
                          {j.id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-ink">
                          {j.model_name ?? "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${
                              j.status === "succeeded"
                                ? "bg-green-50 text-green-700"
                                : j.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {j.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 uppercase text-[10px] text-muted">
                          {j.task_type ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted">
                          {new Date(j.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {data.recent_jobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted">
                          No training runs yet — execute a model training job to see records here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Real Drift Alerts & Insights */}
            <Card className="lg:col-span-2">
              <CardHeader
                icon={<Icon name="alert-triangle" className="h-5 w-5 text-primary" />}
                title="Drift Alerts &amp; Retraining Status"
                subtitle="Evidently-detected drift events across deployed models"
                action={
                  <button
                    type="button"
                    onClick={() => navigate("/monitoring")}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Monitoring <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </button>
                }
              />

              {data.drift_alerts.recent_alerts.length > 0 ? (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {data.drift_alerts.recent_alerts.map((alert) => (
                    <div
                      key={alert.snapshot_id}
                      className={`p-3 rounded-lg border text-xs space-y-1 transition-colors ${
                        alert.is_active
                          ? "border-red-200 bg-red-50/50"
                          : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              alert.is_active ? "bg-red-500 animate-pulse" : "bg-green-500"
                            }`}
                          />
                          <span className="font-semibold text-ink">{alert.model_name}</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase ${
                            alert.is_active
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted">
                        <span>
                          Drift Share:{" "}
                          <strong className="text-ink">
                            {alert.drift_share !== null ? `${Math.round(alert.drift_share * 100)}%` : "N/A"}
                          </strong>
                        </span>
                        <span className="font-mono">{alert.snapshot_id.slice(0, 8)}</span>
                      </div>
                      {alert.resolution_reason && (
                        <p className="text-[10px] text-muted pt-0.5 italic">
                          {alert.resolution_reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-700 mb-2">
                    <Icon name="check-circle" className="h-6 w-6" />
                  </div>
                  <h4 className="text-xs font-semibold text-ink">All Systems Healthy</h4>
                  <p className="text-[11px] text-muted mt-1 max-w-xs">
                    No active data drift alerts detected. All monitored deployments are operating within normal baseline limits.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/monitoring")}
                    className="mt-3 text-xs font-semibold text-primary hover:underline"
                  >
                    Evaluate new drift window &rarr;
                  </button>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
