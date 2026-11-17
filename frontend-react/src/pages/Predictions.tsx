import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApiError, type JobSummary } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

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
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-[28px] font-bold text-ink">Predictions</h1>
      <Card>
        <CardHeader icon={<Icon name="predictions" className="h-5 w-5 text-primary" />} title="Use a trained model" subtitle="Closes the previous use-model.html gap: run inference with a completed training job" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Trained model (job)</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            >
              <option value="" disabled>
                Select a completed training job
              </option>
              {completedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.model_name} — {j.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">CSV to predict on</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Predicting…" : "Predict"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {predictions && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-ink">{predictions.length} predictions</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-bg p-3 text-xs text-ink">
              {JSON.stringify(predictions, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
