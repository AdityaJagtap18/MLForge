import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApiError, type ModelVersion, type RetrainingAudit, type RetrainingCandidate } from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-primary/10 text-primary",
  rejected: "bg-red-50 text-red-700",
  promotion_failed: "bg-red-50 text-red-700",
  evaluated: "bg-amber/10 text-amber",
  pending: "bg-line text-muted",
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
    <div>
      <h1 className="mb-1 text-[28px] font-bold text-ink">Pipelines</h1>
      <p className="mb-6 text-sm text-muted">Controlled retraining: manual or drift-triggered candidates, evaluated against the current champion, promoted only by explicit human approval.</p>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <Card className="col-span-2">
          <CardHeader icon={<Icon name="pipelines" className="h-5 w-5 text-primary" />} title="Trigger manual retraining" subtitle="Reuses the selected model's original dataset and config" />
          <form onSubmit={handleTrigger} className="space-y-3">
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
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
            <button
              type="submit"
              disabled={busy || !selectedVersionId}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Trigger Retraining"}
            </button>
          </form>
          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </Card>

        <Card className="col-span-3">
          <CardHeader icon={<Icon name="experiments" className="h-5 w-5 text-primary" />} title="Retraining candidates" subtitle="Click a row to inspect evaluation, decision and audit trail" />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-medium">Candidate</th>
                <th className="font-medium">Source</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openCandidate(c)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-bg"
                >
                  <td className="py-2 font-mono text-xs text-primary">{c.id.slice(0, 8)}</td>
                  <td>{c.source}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ""}`}>{c.status}</span>
                  </td>
                  <td className="text-muted">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No retraining candidates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {selected && (
        <Card>
          <CardHeader
            icon={<Icon name="check-circle" className="h-5 w-5 text-primary" />}
            title={`Candidate ${selected.id.slice(0, 8)}`}
            subtitle={selected.reason ?? undefined}
          />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Evaluation</p>
              {audit?.evaluation ? (
                <ul className="space-y-1 text-sm text-muted">
                  <li>Candidate score: {String(audit.evaluation.candidate_score)}</li>
                  <li>Champion score: {String(audit.evaluation.champion_score)}</li>
                  <li>Gate threshold: {audit.evaluation.gate_threshold}</li>
                  <li className={audit.evaluation.passed ? "text-primary" : "text-red-700"}>
                    {audit.evaluation.passed ? "Passed" : "Failed"}: {audit.evaluation.reason}
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-muted">Not evaluated yet.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Decision</p>
              {audit?.decision?.decision ? (
                <ul className="space-y-1 text-sm text-muted">
                  <li>Decision: {audit.decision.decision}</li>
                  <li>Reason: {audit.decision.reason ?? "—"}</li>
                  <li>Decided at: {audit.decision.decided_at ? new Date(audit.decision.decided_at).toLocaleString() : "—"}</li>
                  {audit.promoted_version && <li>Promoted to: v{audit.promoted_version.version} ({audit.promoted_version.lifecycle_state})</li>}
                </ul>
              ) : (
                <p className="text-sm text-muted">No decision yet.</p>
              )}
              {audit?.monitoring_snapshot && (
                <p className="mt-2 text-xs text-muted">Drift-triggered by monitoring snapshot {audit.monitoring_snapshot.id.slice(0, 8)} (drift_share={String(audit.monitoring_snapshot.drift_share)}).</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {selected.status === "pending" && (
              <button onClick={() => handleEvaluate(selected.id)} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Evaluate
              </button>
            )}
            {selected.status === "evaluated" && !selected.decision && (
              <>
                <button onClick={() => handleDecision(selected.id, "approve")} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Approve &amp; Promote
                </button>
                <button onClick={() => handleDecision(selected.id, "reject")} disabled={busy} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
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
