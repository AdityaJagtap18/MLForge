import { useState } from "react";
import { api } from "../api/client";
import { ApiError, type FindBestModelResponse } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

export function FindBestModel() {
  const [file, setFile] = useState<File | null>(null);
  const [inputCols, setInputCols] = useState("");
  const [targetCol, setTargetCol] = useState("");
  const [taskType, setTaskType] = useState<"" | "classification" | "regression">("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FindBestModelResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("input_cols", inputCols);
      form.append("target_col", targetCol);
      if (taskType) form.append("task_type", taskType);
      setResult(await api.findBestModel(form));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-[28px] font-bold text-ink">Find the Best Model</h1>
      <Card>
        <CardHeader icon={<Icon name="experiments" className="h-5 w-5 text-primary" />} title="AutoML candidate search" subtitle="Trains every catalog model allowed for the task type and ranks them" />
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
            <label className="mb-1 block text-sm font-medium text-ink">Input columns (comma-separated)</label>
            <input
              value={inputCols}
              onChange={(e) => setInputCols(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Target column</label>
            <input
              value={targetCol}
              onChange={(e) => setTargetCol(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Task type (optional -- auto-detected if omitted)</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as typeof taskType)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
            >
              <option value="">Auto-detect</option>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find Best Model"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {result && (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">
              Best model: <span className="text-primary">{result.best_model}</span> ({result.task_type})
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2">Model</th>
                  <th>Metrics</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-2">{String(row.model)}</td>
                    <td className="text-xs text-muted">
                      {Object.entries(row)
                        .filter(([k]) => k !== "model" && k !== "report")
                        .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(3) : v}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
