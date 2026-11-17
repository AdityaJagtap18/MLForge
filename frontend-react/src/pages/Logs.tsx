import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { JobSummary } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-primary/10 text-primary",
  failed: "bg-red-50 text-red-700",
  running: "bg-amber/10 text-amber",
  pending: "bg-line text-muted",
};

export function Logs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listJobs()
      .then(setJobs)
      .catch(() => setError("Could not load job history."));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-[28px] font-bold text-ink">Audit &amp; Logs</h1>
      <Card>
        <CardHeader icon={<Icon name="logs" className="h-5 w-5 text-primary" />} title="Job history" subtitle="Closes the previous logs.html gap: every train/find-best/predict run, queryable" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-medium">Job ID</th>
              <th className="font-medium">Type</th>
              <th className="font-medium">Model</th>
              <th className="font-medium">Status</th>
              <th className="font-medium">Created</th>
              <th className="font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-line last:border-0">
                <td className="py-2 font-mono text-xs text-primary">{j.id.slice(0, 8)}</td>
                <td>{j.job_type}</td>
                <td>{j.model_name ?? "—"}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status] ?? ""}`}>
                    {j.status}
                  </span>
                </td>
                <td className="text-muted">{new Date(j.created_at).toLocaleString()}</td>
                <td className="max-w-xs truncate text-xs text-red-700">{j.error_message ?? ""}</td>
              </tr>
            ))}
            {jobs.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
