import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ApiError } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

export function TrainModel() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { targetCol?: string; inputCols?: string } | null;

  const [models, setModels] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [inputCols, setInputCols] = useState(state?.inputCols ?? "");
  const [targetCol, setTargetCol] = useState(state?.targetCol ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registeredVersion, setRegisteredVersion] = useState<string | null>(null);

  useEffect(() => {
    api
      .listModels()
      .then((r) => setModels(r.models))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load model catalog."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRegisteredVersion(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("model_name", modelName);
      form.append("input_cols", inputCols);
      form.append("target_col", targetCol);
      form.append("model_params", "{}");
      const res = await api.trainModel(form);
      setResult(res as unknown as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Training failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-[28px] font-bold text-ink">Train a Model</h1>
      <Card>
        <CardHeader icon={<Icon name="train-model" className="h-5 w-5 text-primary" />} title="Single-model training" subtitle="Upload a CSV, choose columns and a model" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Dataset (CSV)</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Model</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            >
              <option value="" disabled>
                Select a model
              </option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Input columns (comma-separated)</label>
            <input
              value={inputCols}
              onChange={(e) => setInputCols(e.target.value)}
              placeholder="age,city,income"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Target column</label>
            <input
              value={targetCol}
              onChange={(e) => setTargetCol(e.target.value)}
              placeholder="label"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Training…" : "Train Model"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {result && (
          <div className="mt-6 space-y-4 rounded-lg border border-line bg-bg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <Icon name="check-circle" className="h-5 w-5 text-green-600" />
                <span>Training Succeeded</span>
              </div>
              <span className="font-mono text-xs text-muted">Job ID: {String(result.job_id)}</span>
            </div>

            {Boolean(result.metrics) && typeof result.metrics === "object" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(result.metrics as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="rounded bg-surface p-2 border border-line/60">
                    <span className="text-[10px] uppercase text-muted">{k}</span>
                    <p className="font-bold text-ink text-sm">
                      {typeof v === "number" ? v.toFixed(4) : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
              {registeredVersion ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-700 font-medium">{registeredVersion}</span>
                  <button
                    type="button"
                    onClick={() => navigate("/registry")}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    View in Registry →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/explainability", { state: { jobId: result.job_id } })}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg transition-colors"
                  >
                    <Icon name="explainability" className="h-4 w-4 text-primary" />
                    Explain (SHAP) →
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={registering}
                    onClick={async () => {
                      if (!result.job_id) return;
                      setRegistering(true);
                      try {
                        const ver = await api.registerModel(String(result.job_id));
                        setRegisteredVersion(`Registered as ${ver.model_name} v${ver.version}`);
                      } catch (e) {
                        setError(e instanceof ApiError ? e.message : "Failed to register model.");
                      } finally {
                        setRegistering(false);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <Icon name="model-registry" className="h-4 w-4" />
                    {registering ? "Registering..." : "Register in Model Registry"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/explainability", { state: { jobId: result.job_id } })}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg transition-colors"
                  >
                    <Icon name="explainability" className="h-4 w-4 text-primary" />
                    Explain (SHAP) →
                  </button>
                </div>
              )}

              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-ink">View Raw JSON</summary>
                <pre className="mt-2 max-h-48 overflow-x-auto rounded bg-surface p-2 text-[11px] text-ink border border-line">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
