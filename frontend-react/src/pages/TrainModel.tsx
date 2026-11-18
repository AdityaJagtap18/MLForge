import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ApiError } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

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
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Train Models"
        subtitle="Configure feature inputs, select an algorithm family, and train an operational ML model."
      />
      <Card>
        <CardHeader
          icon={<Icon name="train-model" className="h-5 w-5 text-primary" />}
          title="Single Model Training"
          subtitle="Upload training CSV, map input features, and train a candidate model"
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Dataset (CSV)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-surface file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-ink hover:file:bg-line/50 cursor-pointer"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Model Algorithm
            </label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
              required
            >
              <option value="" disabled>
                Select an algorithm
              </option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Input columns (comma-separated)
            </label>
            <input
              value={inputCols}
              onChange={(e) => setInputCols(e.target.value)}
              placeholder="e.g. age, city, income"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Target column
            </label>
            <input
              value={targetCol}
              onChange={(e) => setTargetCol(e.target.value)}
              placeholder="e.g. label"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Training Model…
              </>
            ) : (
              <>
                <Icon name="train-model" className="h-4 w-4" />
                Train Model
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <Icon name="alert-triangle" className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4 rounded-xl border border-line bg-bg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-xs">
                <Icon name="check-circle" className="h-4 w-4 text-green-600" />
                <span>Training Succeeded</span>
              </div>
              <span className="font-mono text-xs text-muted">Job ID: {String(result.job_id)}</span>
            </div>

            {Boolean(result.metrics) && typeof result.metrics === "object" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(result.metrics as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface p-2.5 border border-line shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-muted tracking-wider block">{k}</span>
                    <p className="font-bold text-ink text-sm mt-0.5">
                      {typeof v === "number" ? v.toFixed(4) : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              {registeredVersion ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-green-700 font-semibold">{registeredVersion}</span>
                  <button
                    type="button"
                    onClick={() => navigate("/registry")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    View in Registry →
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/explainability", { state: { jobId: result.job_id } })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-2xs"
                  >
                    <Icon name="explainability" className="h-4 w-4 text-primary" />
                    Explain (SHAP) →
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <Icon name="model-registry" className="h-4 w-4" />
                    {registering ? "Registering..." : "Register in Model Registry"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/explainability", { state: { jobId: result.job_id } })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg transition-colors shadow-2xs"
                  >
                    <Icon name="explainability" className="h-4 w-4 text-primary" />
                    Explain (SHAP) →
                  </button>
                </div>
              )}

              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-ink font-medium">View Raw JSON</summary>
                <pre className="mt-2 max-h-48 overflow-x-auto rounded-lg bg-surface p-2.5 text-[11px] text-ink border border-line font-mono">
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
