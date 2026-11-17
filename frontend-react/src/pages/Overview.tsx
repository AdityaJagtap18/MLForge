import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { EChartsOption } from "echarts";
import { EChart } from "../components/charts/EChart";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import type { JobSummary } from "../api/types";

// Demo fixtures for modules not yet implemented (Model Registry, Deployments,
// Monitoring, Alerts are Phase 2/3). Per the transformation prompt these must
// never be presented as live data -- the "Demo data" badge below is load-bearing,
// not decorative.
const DEMO_TRAINING_ACTIVITY = [3, 4, 5, 6, 5, 7, 9, 8, 10, 12, 14, 13, 16, 20, 18, 22, 25, 23, 20, 18];
const DEMO_MODEL_PERFORMANCE = [
  { model: "XGBoost", f1: 0.96 },
  { model: "Random Forest", f1: 0.94 },
  { model: "LightGBM", f1: 0.93 },
  { model: "Logistic Regression", f1: 0.88 },
];

export function Overview() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [apiStatus, setApiStatus] = useState<"ok" | "degraded" | "unknown">("unknown");

  useEffect(() => {
    api
      .listJobs()
      .then(setJobs)
      .catch(() => setJobs([]));
    api
      .health()
      .then((h) => setApiStatus(h.status === "ok" ? "ok" : "degraded"))
      .catch(() => setApiStatus("degraded"));
  }, []);

  const datasetCount = new Set(jobs.map((j) => j.dataset_filename)).size;
  const experimentCount = jobs.filter((j) => j.job_type !== "predict").length;

  const trainingActivityOption: EChartsOption = {
    grid: { left: 36, right: 16, top: 16, bottom: 24 },
    xAxis: { type: "category", data: DEMO_TRAINING_ACTIVITY.map((_, i) => `D${i + 1}`), axisLine: { lineStyle: { color: "#EAE4DC" } } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#F3EFEA" } } },
    series: [
      {
        type: "line",
        data: DEMO_TRAINING_ACTIVITY,
        smooth: true,
        symbol: "circle",
        lineStyle: { color: "#E96B18", width: 2 },
        itemStyle: { color: "#E96B18" },
        areaStyle: { color: "rgba(233,107,24,0.12)" },
      },
    ],
  };

  const modelPerformanceOption: EChartsOption = {
    grid: { left: 140, right: 40, top: 16, bottom: 24 },
    xAxis: { type: "value", min: 0.8, max: 1, splitLine: { lineStyle: { color: "#F3EFEA" } } },
    yAxis: { type: "category", data: DEMO_MODEL_PERFORMANCE.map((m) => m.model).reverse() },
    series: [
      {
        type: "bar",
        data: DEMO_MODEL_PERFORMANCE.map((m) => m.f1).reverse(),
        itemStyle: { color: "#E96B18", borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", formatter: (p) => String(p.value) },
        barWidth: 18,
      },
    ],
  };

  const kpis = [
    { icon: "datasets" as const, label: "Datasets", value: datasetCount || "—", caption: "Unique uploads this session" },
    { icon: "experiments" as const, label: "Experiments", value: experimentCount || "—", caption: "Training runs (this API)" },
    { icon: "model-registry" as const, label: "Registered Models", value: "—", caption: "Demo data · Phase 2" },
    { icon: "deployment" as const, label: "Deployed Models", value: "—", caption: "Demo data · Phase 3" },
    { icon: "monitoring" as const, label: "Inference Requests", value: "—", caption: "Demo data · Phase 3" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-ink">Overview</h1>
          <p className="text-sm text-muted">Your end-to-end machine learning platform for building, deploying, and operating ML models.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
          <Icon name="calendar" className="h-4 w-4 text-muted" />
          Last 30 Days
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name={k.icon} className="h-5 w-5" />
            </div>
            <div className="text-xs text-muted">{k.label}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{k.value}</div>
            <div className="mt-1 text-xs text-muted">{k.caption}</div>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <Card className="col-span-2">
          <CardHeader icon={<Icon name="experiments" className="h-5 w-5 text-primary" />} title="Training Activity" subtitle="Demo data -- model training runs over time" />
          <EChart option={trainingActivityOption} />
        </Card>
        <Card className="col-span-2">
          <CardHeader icon={<Icon name="chart" className="h-5 w-5 text-primary" />} title="Model Performance (Latest)" subtitle="Demo data -- compare top models on key metrics" />
          <EChart option={modelPerformanceOption} />
        </Card>
        <Card>
          <CardHeader icon={<Icon name="monitoring" className="h-5 w-5 text-primary" />} title="System Health" />
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-ink"><Icon name="check-circle" className="h-4 w-4 text-primary" />API Service</span>
              <span className="text-muted">{apiStatus === "ok" ? "Operational" : apiStatus === "degraded" ? "Degraded" : "Checking..."}</span>
            </li>
            <li className="flex items-center justify-between text-muted">
              <span className="flex items-center gap-2"><Icon name="check-circle" className="h-4 w-4" />MLflow Tracking</span>
              <span>Not configured (Phase 2)</span>
            </li>
            <li className="flex items-center justify-between text-muted">
              <span className="flex items-center gap-2"><Icon name="check-circle" className="h-4 w-4" />Monitoring (Evidently)</span>
              <span>Not configured (Phase 3)</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card className="col-span-3">
          <CardHeader
            icon={<Icon name="experiments" className="h-5 w-5 text-primary" />}
            title="Recent Experiments"
            subtitle="Latest training runs and results"
            action={
              <a href="/logs" className="flex items-center gap-1 text-sm font-medium text-primary">
                View All <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </a>
            }
          />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-medium">Job</th>
                <th className="font-medium">Model</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 5).map((j) => (
                <tr key={j.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-mono text-xs text-primary">{j.id.slice(0, 8)}</td>
                  <td>{j.model_name ?? "—"}</td>
                  <td>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {j.status}
                    </span>
                  </td>
                  <td className="text-muted">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No runs yet -- train a model to see it here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="col-span-2">
          <CardHeader icon={<Icon name="alert-triangle" className="h-5 w-5 text-primary" />} title="Alerts &amp; Insights" subtitle="Demo data -- Monitoring ships in Phase 3" />
          <ul className="space-y-3 text-sm text-muted">
            <li className="flex items-start gap-2">
              <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
              Drift and quality-gate alerts will appear here once Monitoring (Evidently) is implemented.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
