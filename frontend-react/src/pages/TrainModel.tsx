import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApiError } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

export function TrainModel() {
  const [models, setModels] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [inputCols, setInputCols] = useState("");
  const [targetCol, setTargetCol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

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
          <pre className="mt-4 overflow-x-auto rounded-lg bg-bg p-3 text-xs text-ink">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}
