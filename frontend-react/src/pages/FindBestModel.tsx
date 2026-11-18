import { useState } from "react";
import { api } from "../api/client";
import { ApiError, type FindBestModelResponse } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

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
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="AutoML Experiments"
        subtitle="Train every catalog model allowed for the task type and automatically rank performance."
      />
      <Card>
        <CardHeader
          icon={<Icon name="experiments" className="h-5 w-5 text-primary" />}
          title="AutoML Candidate Search"
          subtitle="Upload training data and configure feature targets to initiate multi-model evaluation"
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
              Input columns (comma-separated)
            </label>
            <input
              value={inputCols}
              onChange={(e) => setInputCols(e.target.value)}
              placeholder="e.g. age, salary, tenure"
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
              placeholder="e.g. churn"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Task type (optional — auto-detected if omitted)
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as typeof taskType)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
            >
              <option value="">Auto-detect</option>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Searching Candidates…
              </>
            ) : (
              <>
                <Icon name="search" className="h-4 w-4" />
                Find Best Model
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
          <div className="mt-6 space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">
                Best model: <span className="text-primary font-bold">{result.best_model}</span>
              </span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary capitalize">
                {result.task_type}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs text-ink">
                <thead>
                  <tr className="border-b border-line bg-bg/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Metrics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.results.map((row, i) => (
                    <tr key={i} className="hover:bg-bg/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{String(row.model)}</td>
                      <td className="py-2.5 px-3 text-xs text-muted font-mono">
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
          </div>
        )}
      </Card>
    </div>
  );
}
