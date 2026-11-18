import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApiError, type JobSummary } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

export function Predictions() {
  const [completedJobs, setCompletedJobs] = useState<JobSummary[]>([]);
  const [jobId, setJobId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<(number | string)[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .listJobs()
      .then((jobs) => setCompletedJobs(jobs.filter((j) => j.job_type !== "predict" && j.status === "succeeded")))
      .catch(() => setCompletedJobs([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !jobId) return;
    setLoading(true);
    setError(null);
    setPredictions(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("job_id", jobId);
      const res = await api.predict(form);
      setPredictions(res.predictions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Prediction failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Batch Predictions"
        subtitle="Run batch inference against a completed training job using an uploaded dataset."
      />
      <Card>
        <CardHeader
          icon={<Icon name="predictions" className="h-5 w-5 text-primary" />}
          title="Run Batch Inference"
          subtitle="Select a succeeded model run and upload an input CSV matching the model features"
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Trained Model (Job)
            </label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
              required
            >
              <option value="" disabled>
                Select a completed training job
              </option>
              {completedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.model_name} — {j.id.slice(0, 8)} ({new Date(j.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
              Input Dataset (CSV)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-surface file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-ink hover:file:bg-line/50 cursor-pointer"
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
                Generating Predictions…
              </>
            ) : (
              <>
                <Icon name="predictions" className="h-4 w-4" />
                Generate Predictions
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

        {predictions && (
          <div className="mt-6 space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted tracking-wider">
                Inference Results
              </span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {predictions.length} output rows
              </span>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs text-ink">
              {JSON.stringify(predictions, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
