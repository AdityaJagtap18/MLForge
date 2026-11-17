"""Phase 4: controlled automation -- manual retraining, candidate
evaluation, drift-triggered generation, human approval/rejection, audit."""
from __future__ import annotations

import pandas as pd
import pytest


def _classification_csv(n=80):
    rows = [{"age": 20 + (i % 40), "city": ["NY", "LA", "SF"][i % 3], "label": i % 2} for i in range(n)]
    return pd.DataFrame(rows).to_csv(index=False).encode()


def _register(client, email, password="password123"):
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _train(client, token):
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,city", "target_col": "label", "model_params": "{}"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    return resp.json()["job_id"]


def _register_version(client, token, job_id):
    resp = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token))
    assert resp.status_code == 200
    return resp.json()["id"]


def _stage_and_promote(client, token, version_id):
    r1 = client.post(f"/api/v1/registry/{version_id}/promote", json={"target_state": "staging"}, headers=_auth(token))
    assert r1.status_code == 200
    r2 = client.post(f"/api/v1/registry/{version_id}/promote", json={"target_state": "production"}, headers=_auth(token))
    assert r2.status_code == 200
    return r2.json()


def _champion_version(client, token):
    job_id = _train(client, token)
    version_id = _register_version(client, token, job_id)
    _stage_and_promote(client, token, version_id)
    return version_id


# ---------------------------------------------------------------- 4A: manual


def test_manual_retraining_creates_linked_candidate_and_job(client):
    token = _register(client, "retrain-manual@example.com")
    version_id = _champion_version(client, token)

    resp = client.post("/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token))
    assert resp.status_code == 200
    candidate = resp.json()
    assert candidate["source"] == "manual"
    assert candidate["status"] == "pending"
    assert candidate["job_id"]
    assert candidate["monitoring_snapshot_id"] is None

    job = client.get(f"/api/v1/jobs/{candidate['job_id']}", headers=_auth(token)).json()
    assert job["status"] == "succeeded"
    assert job["model_name"] == "Logistic Regression"


def test_manual_retraining_does_not_touch_current_champion(client):
    token = _register(client, "retrain-no-touch@example.com")
    version_id = _champion_version(client, token)

    client.post("/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token))

    champion = client.get("/api/v1/registry", headers=_auth(token)).json()
    champion_row = next(v for v in champion if v["id"] == version_id)
    assert champion_row["lifecycle_state"] == "production"


def test_manual_retraining_preserves_ownership_and_records_trigger(client):
    token_a = _register(client, "retrain-owner-a@example.com")
    token_b = _register(client, "retrain-owner-b@example.com")
    version_a = _champion_version(client, token_a)

    resp = client.post("/api/v1/retraining/trigger", json={"model_version_id": version_a}, headers=_auth(token_b))
    assert resp.status_code == 404  # b cannot even see a's version

    candidates_b = client.get("/api/v1/retraining", headers=_auth(token_b)).json()
    assert candidates_b == []


def test_candidate_list_scoped_to_owner(client):
    token_a = _register(client, "retrain-list-a@example.com")
    token_b = _register(client, "retrain-list-b@example.com")
    version_a = _champion_version(client, token_a)
    client.post("/api/v1/retraining/trigger", json={"model_version_id": version_a}, headers=_auth(token_a))

    list_a = client.get("/api/v1/retraining", headers=_auth(token_a)).json()
    list_b = client.get("/api/v1/retraining", headers=_auth(token_b)).json()
    assert len(list_a) == 1
    assert list_b == []


# ------------------------------------------------------------ 4B: evaluation


def test_evaluation_passes_and_beats_nonexistent_champion(client):
    token = _register(client, "eval-nochamp@example.com")
    job_id = _train(client, token)
    version_id = _register_version(client, token, job_id)
    # Not promoted -- no champion exists yet.

    resp = client.post("/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token))
    candidate_id = resp.json()["id"]

    eval_resp = client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    assert body["status"] == "evaluated"
    assert body["evaluation"]["passed"] is True
    assert body["evaluation"]["champion_version_id"] is None


def test_evaluation_records_champion_version_and_scores(client):
    token = _register(client, "eval-champ@example.com")
    version_id = _champion_version(client, token)

    resp = client.post("/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token))
    candidate_id = resp.json()["id"]

    eval_resp = client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))
    body = eval_resp.json()
    assert body["evaluation"]["champion_version_id"] == version_id
    assert body["evaluated_champion_version_id"] == version_id
    assert body["evaluation"]["candidate_score"] is not None
    assert body["evaluation"]["champion_score"] is not None


def test_evaluation_quality_gate_rejection(client, monkeypatch):
    import api.registry_service as registry_service

    monkeypatch.setattr(registry_service, "_MIN_PROMOTION_SCORE", 2.0)  # unreachable

    token = _register(client, "eval-gatefail@example.com")
    job_id = _train(client, token)
    version_id = _register_version(client, token, job_id)

    resp = client.post("/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token))
    candidate_id = resp.json()["id"]

    eval_resp = client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))
    body = eval_resp.json()
    assert body["status"] == "rejected"
    assert body["decision"] == "rejected"
    assert body["evaluation"]["passed"] is False


def test_cannot_approve_without_evaluation(client):
    token = _register(client, "approve-missing-eval@example.com")
    version_id = _champion_version(client, token)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]

    resp = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token))
    assert resp.status_code == 400


def test_cannot_approve_after_gate_failed_rejection(client, monkeypatch):
    import api.registry_service as registry_service

    monkeypatch.setattr(registry_service, "_MIN_PROMOTION_SCORE", 2.0)

    token = _register(client, "approve-after-autoreject@example.com")
    job_id = _train(client, token)
    version_id = _register_version(client, token, job_id)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))

    resp = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token))
    assert resp.status_code == 400


def test_cannot_approve_stale_evaluation_after_champion_changes(client, monkeypatch):
    """If someone else becomes champion after this candidate was evaluated,
    approval must be refused until it's re-evaluated."""
    import api.retraining_service as retraining_service

    # Both candidates retrain on the champion's own dataset/config, so their
    # scores are a near-tie by construction -- force the champion's score
    # down so "beats champion" is deterministic rather than flaky.
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champion: -1.0)

    token = _register(client, "approve-stale@example.com")
    version_id = _champion_version(client, token)

    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))

    # A different candidate for the same owner+model gets approved first,
    # changing the champion out from under the first evaluation.
    other_candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{other_candidate_id}/evaluate", headers=_auth(token))
    approve_other = client.post(f"/api/v1/retraining/{other_candidate_id}/approve", json={}, headers=_auth(token))
    assert approve_other.status_code == 200

    stale_approve = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token))
    assert stale_approve.status_code == 400
    assert "champion has changed" in stale_approve.json()["detail"].lower()


# ----------------------------------------------------- 4C: drift-triggered


def test_drift_triggered_candidate_generation(client):
    token = _register(client, "drift-gen@example.com")
    version_id = _champion_version(client, token)

    deploy_resp = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token))
    deployment_id = deploy_resp.json()["id"]

    shifted = pd.DataFrame({"age": [95] * 80, "city": ["LA"] * 80, "label": [1] * 80})
    files = {"file": ("window.csv", shifted.to_csv(index=False).encode(), "text/csv")}
    monitor_resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    snapshot_id = monitor_resp.json()["id"]

    if monitor_resp.json()["status"] != "ok":
        pytest.skip("evidently unavailable in this environment; drift-triggered generation not exercisable")

    resp = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=_auth(token))
    assert resp.status_code == 200
    candidate = resp.json()
    assert candidate["source"] == "drift"
    assert candidate["monitoring_snapshot_id"] == snapshot_id
    assert "drift" in candidate["reason"].lower()


def test_duplicate_drift_alert_does_not_create_duplicate_candidate(client):
    token = _register(client, "drift-dup@example.com")
    version_id = _champion_version(client, token)
    deployment_id = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token)).json()["id"]

    shifted = pd.DataFrame({"age": [95] * 80, "city": ["LA"] * 80, "label": [1] * 80})
    files = {"file": ("window.csv", shifted.to_csv(index=False).encode(), "text/csv")}
    monitor_resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    snapshot_id = monitor_resp.json()["id"]
    if monitor_resp.json()["status"] != "ok":
        pytest.skip("evidently unavailable in this environment")

    first = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=_auth(token))
    second = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=_auth(token))
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    all_candidates = client.get("/api/v1/retraining", headers=_auth(token)).json()
    linked_to_snapshot = [c for c in all_candidates if c["monitoring_snapshot_id"] == snapshot_id]
    assert len(linked_to_snapshot) == 1


def test_non_alerting_snapshot_does_not_generate_a_candidate(client):
    token = _register(client, "drift-noalert@example.com")
    version_id = _champion_version(client, token)
    deployment_id = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token)).json()["id"]

    files = {"file": ("window.csv", _classification_csv(80), "text/csv")}
    monitor_resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    snapshot_id = monitor_resp.json()["id"]
    if monitor_resp.json()["status"] != "ok" or monitor_resp.json()["alert"]:
        pytest.skip("this window happened to alert or evidently is unavailable; not exercising the non-alert path")

    resp = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=_auth(token))
    assert resp.status_code == 400


# --------------------------------------------------------- 4D: approval


def test_approval_promotes_through_existing_registry(client):
    token = _register(client, "approve-ok@example.com")
    job_id = _train(client, token)
    version_id = _register_version(client, token, job_id)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))

    resp = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={"reason": "looks good"}, headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "approved"
    assert body["status"] == "approved"
    assert body["promoted_version_id"]

    promoted = client.get("/api/v1/registry", headers=_auth(token)).json()
    promoted_row = next(v for v in promoted if v["id"] == body["promoted_version_id"])
    assert promoted_row["lifecycle_state"] == "production"


def test_rejection_never_touches_production(client, monkeypatch):
    import api.retraining_service as retraining_service

    monkeypatch.setattr(retraining_service, "_champion_score", lambda champion: -1.0)

    token = _register(client, "reject-safe@example.com")
    version_id = _champion_version(client, token)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))

    resp = client.post(f"/api/v1/retraining/{candidate_id}/reject", json={"reason": "not needed"}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["decision"] == "rejected"
    assert resp.json()["promoted_version_id"] is None

    champion = client.get("/api/v1/registry", headers=_auth(token)).json()
    champion_row = next(v for v in champion if v["id"] == version_id)
    assert champion_row["lifecycle_state"] == "production"


def test_unauthorized_user_cannot_approve_or_reject(client):
    token_a = _register(client, "unauth-approve-a@example.com")
    token_b = _register(client, "unauth-approve-b@example.com")
    version_a = _champion_version(client, token_a)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_a}, headers=_auth(token_a)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token_a))

    approve_resp = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token_b))
    assert approve_resp.status_code == 404
    reject_resp = client.post(f"/api/v1/retraining/{candidate_id}/reject", json={}, headers=_auth(token_b))
    assert reject_resp.status_code == 404


def test_double_decision_is_rejected_not_silently_reapplied(client, monkeypatch):
    """Guards against inconsistent concurrent approval: once decided, a
    second decision call (approve or reject) is always refused."""
    import api.retraining_service as retraining_service

    monkeypatch.setattr(retraining_service, "_champion_score", lambda champion: -1.0)

    token = _register(client, "double-decide@example.com")
    version_id = _champion_version(client, token)
    candidate_id = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()["id"]
    client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=_auth(token))

    first = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token))
    assert first.status_code == 200
    second = client.post(f"/api/v1/retraining/{candidate_id}/approve", json={}, headers=_auth(token))
    assert second.status_code == 400
    third = client.post(f"/api/v1/retraining/{candidate_id}/reject", json={}, headers=_auth(token))
    assert third.status_code == 400


def test_audit_chain_is_queryable_for_drift_candidate(client, monkeypatch):
    import api.retraining_service as retraining_service

    # Same-dataset retraining scores a near-tie against the champion by
    # construction -- force a deterministic "beats champion" for this test.
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champion: -1.0)

    token = _register(client, "audit-chain@example.com")
    version_id = _champion_version(client, token)
    deployment_id = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token)).json()["id"]

    shifted = pd.DataFrame({"age": [95] * 80, "city": ["LA"] * 80, "label": [1] * 80})
    files = {"file": ("window.csv", shifted.to_csv(index=False).encode(), "text/csv")}
    monitor_resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    if monitor_resp.json()["status"] != "ok":
        pytest.skip("evidently unavailable in this environment")
    snapshot_id = monitor_resp.json()["id"]

    candidate = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=_auth(token)).json()
    client.post(f"/api/v1/retraining/{candidate['id']}/evaluate", headers=_auth(token))
    client.post(f"/api/v1/retraining/{candidate['id']}/approve", json={"reason": "beats champion"}, headers=_auth(token))

    audit = client.get(f"/api/v1/retraining/{candidate['id']}/audit", headers=_auth(token))
    assert audit.status_code == 200
    body = audit.json()
    assert body["monitoring_snapshot"]["id"] == snapshot_id
    assert body["training_job"]["status"] == "succeeded"
    assert body["evaluation"]["passed"] is True
    assert body["decision"]["decision"] == "approved"
    assert body["promoted_version"]["lifecycle_state"] == "production"


def test_audit_chain_for_manual_candidate_has_no_snapshot(client):
    token = _register(client, "audit-manual@example.com")
    version_id = _champion_version(client, token)
    candidate = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": version_id}, headers=_auth(token)
    ).json()

    audit = client.get(f"/api/v1/retraining/{candidate['id']}/audit", headers=_auth(token))
    assert audit.status_code == 200
    assert audit.json()["monitoring_snapshot"] is None
    assert audit.json()["source"] == "manual"
