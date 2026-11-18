import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApiError, type ModelVersion, type RetrainingAudit, type RetrainingCandidate } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { PageHeader } from "../components/layout/PageHeader";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
  promotion_failed: "bg-red-50 text-red-700 border border-red-200",
  evaluated: "bg-amber/10 text-amber border border-amber/20",
  pending: "bg-line text-muted border border-line",
};

export function Retraining() {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [candidates, setCandidates] = useState<RetrainingCandidate[]>([]);
  const [selected, setSelected] = useState<RetrainingCandidate | null>(null);
  const [audit, setAudit] = useState<RetrainingAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshCandidates() {
    api
      .listRetrainingCandidates()
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }

  useEffect(() => {
    api
      .listRegistryVersions()
      .then(setVersions)
      .catch(() => setVersions([]));
    refreshCandidates();
  }, []);

  async function handleTrigger(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVersionId) return;
    setBusy(true);
    setError(null);
    try {
      await api.triggerRetraining(selectedVersionId);
      refreshCandidates();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not trigger retraining.");
    } finally {
      setBusy(false);
    }
  }

  async function openCandidate(candidate: RetrainingCandidate) {
    setSelected(candidate);
    setAudit(null);
    try {
      setAudit(await api.getCandidateAudit(candidate.id));
    } catch {
      setAudit(null);
    }
  }

  async function handleEvaluate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.evaluateCandidate(id);
      refreshCandidates();
      if (selected?.id === id) openCandidate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Evaluation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const updated = decision === "approve" ? await api.approveCandidate(id) : await api.rejectCandidate(id);
      refreshCandidates();
      if (selected?.id === id) openCandidate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not ${decision} candidate.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retraining Pipelines"
        subtitle="Controlled retraining: manual or drift-triggered candidates, evaluated against the current champion, promoted only by explicit human approval."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<Icon name="pipelines" className="h-5 w-5 text-primary" />}
            title="Trigger Manual Retraining"
            subtitle="Reuses the selected model's original dataset and config"
          />
          <form onSubmit={handleTrigger} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink uppercase tracking-wider">
                Select Model Version
              </label>
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                required
              >
                <option value="" disabled>
                  Select a registered model version
                </option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.model_name} v{v.version} ({v.lifecycle_state})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !selectedVersionId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Triggering…
                </>
              ) : (
                <>
                  <Icon name="pipelines" className="h-4 w-4" />
                  Trigger Retraining
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
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            icon={<Icon name="experiments" className="h-5 w-5 text-primary" />}
            title="Retraining Candidates"
            subtitle="Click a row to inspect evaluation, decision and audit trail"
          />
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs text-ink">
              <thead>
                <tr className="border-b border-line bg-bg/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 px-3">Candidate</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openCandidate(c)}
                    className="cursor-pointer hover:bg-bg/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-xs text-primary font-semibold">
                      {c.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-3 text-muted">{c.source}</td>
                    <td className="py-2.5 px-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[c.status] ?? ""}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">{new Date(c.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted text-xs">
                      No retraining candidates found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {selected && (
        <Card>
          <CardHeader
            icon={<Icon name="check-circle" className="h-5 w-5 text-primary" />}
            title={`Candidate ${selected.id.slice(0, 8)}`}
            subtitle={selected.reason ?? undefined}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-line pt-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink">Evaluation</p>
              {audit?.evaluation ? (
                <ul className="space-y-1.5 text-xs text-muted rounded-lg bg-bg p-3 border border-line">
                  <li className="flex justify-between">
                    <span>Candidate score:</span>
                    <strong className="text-ink font-mono">{String(audit.evaluation.candidate_score)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Champion score:</span>
                    <strong className="text-ink font-mono">{String(audit.evaluation.champion_score)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Gate threshold:</span>
                    <strong className="text-ink font-mono">{audit.evaluation.gate_threshold}</strong>
                  </li>
                  <li className={`flex justify-between pt-1 border-t border-line/60 font-semibold ${audit.evaluation.passed ? "text-green-700" : "text-red-700"}`}>
                    <span>Result:</span>
                    <span>{audit.evaluation.passed ? "Passed" : "Failed"}: {audit.evaluation.reason}</span>
                  </li>
                </ul>
              ) : (
                <p className="text-xs text-muted rounded-lg bg-bg p-3 border border-line">Not evaluated yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink">Decision &amp; Promotion</p>
              {audit?.decision?.decision ? (
                <ul className="space-y-1.5 text-xs text-muted rounded-lg bg-bg p-3 border border-line">
                  <li className="flex justify-between">
                    <span>Decision:</span>
                    <strong className="text-ink uppercase">{audit.decision.decision}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Reason:</span>
                    <span className="text-ink">{audit.decision.reason ?? "—"}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Decided at:</span>
                    <span className="text-ink">{audit.decision.decided_at ? new Date(audit.decision.decided_at).toLocaleString() : "—"}</span>
                  </li>
                  {audit.promoted_version && (
                    <li className="flex justify-between pt-1 border-t border-line/60 text-green-700 font-semibold">
                      <span>Promoted to:</span>
                      <span>v{audit.promoted_version.version} ({audit.promoted_version.lifecycle_state})</span>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-muted rounded-lg bg-bg p-3 border border-line">No decision recorded yet.</p>
              )}
              {audit?.monitoring_snapshot && (
                <p className="text-[11px] text-muted">
                  Drift-triggered by snapshot <code className="font-mono text-ink">{audit.monitoring_snapshot.id.slice(0, 8)}</code> (drift_share={String(audit.monitoring_snapshot.drift_share)}).
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            {selected.status === "pending" && (
              <button
                type="button"
                onClick={() => handleEvaluate(selected.id)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Evaluate Candidate
              </button>
            )}
            {selected.status === "evaluated" && !selected.decision && (
              <>
                <button
                  type="button"
                  onClick={() => handleDecision(selected.id, "approve")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Approve &amp; Promote
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(selected.id, "reject")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
