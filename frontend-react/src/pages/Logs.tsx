import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { JobSummary } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-green-50 text-green-700 border border-green-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
  running: "bg-amber/10 text-amber border border-amber/20",
  pending: "bg-line text-muted border border-line",
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
    <div className="space-y-6">
      <PageHeader
        title="Audit &amp; Logs"
        subtitle="Immutable audit lineage across model training, candidate searches, predictions, and automated tasks."
      />
      <Card>
        <CardHeader
          icon={<Icon name="logs" className="h-5 w-5 text-primary" />}
          title="System Job History"
          subtitle="Comprehensive audit log of every training run, AutoML search, and inference batch"
        />
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <Icon name="alert-triangle" className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs text-ink">
            <thead>
              <tr className="border-b border-line bg-bg/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-2.5 px-3">Job ID</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Created</th>
                <th className="py-2.5 px-3">Diagnostics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-bg/50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-xs text-primary font-semibold">
                    {j.id.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3 font-medium capitalize">{j.job_type}</td>
                  <td className="py-2.5 px-3">{j.model_name ?? "—"}</td>
                  <td className="py-2.5 px-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[j.status] ?? ""}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-muted">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="py-2.5 px-3 max-w-xs truncate text-[11px] text-red-700 font-mono">
                    {j.error_message ?? "—"}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted text-xs">
                    No system jobs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
