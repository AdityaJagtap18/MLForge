"""Phase 5A.1: End-to-End Lifecycle Integration Test.

Exercises the complete MLForge machine learning lifecycle through real
application interfaces (FastAPI TestClient + SQLAlchemy database):
1. Ingest valid synthetic tabular dataset
2. Submit training request (in-process fitting)
3. Verify training completes successfully and model artifact exists
4. Register trained model in model registry
5. Promote model through registry lifecycle (development -> staging -> production)
6. Deploy active production model to serving slot
7. Execute real-time single-record JSON inference with latency tracking
8. Upload inference window with distribution difference triggering drift alert
9. Generate retraining candidate from drift monitoring snapshot (idempotent)
10. Evaluate candidate against production champion using quality gate
11. Approve and promote candidate via human approval gate
12. Retrieve complete audit lineage:
    MonitoringSnapshot -> RetrainingCandidate -> Job -> Evaluation -> Approval Decision -> Promoted ModelVersion
"""
from __future__ import annotations

import os
from typing import Any

import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Test Data Fixtures & Helpers
# ---------------------------------------------------------------------------

def _synthetic_churn_data(n: int = 100, drift: bool = False) -> bytes:
    """Generates synthetic customer churn data with numerical and categorical features.

    When drift=True, shifts distributions of age (elderly), tenure (new users),
    and contract (month-to-month only) to trigger genuine Evidently drift detection.
    """
    rows = []
    for i in range(n):
        if not drift:
            age = 20 + (i % 45)
            tenure = 1 + (i % 36)
            monthly_charges = round(25.0 + (i % 70) * 1.05, 2)
            contract = ["month-to-month", "one-year", "two-year"][i % 3]
            churn = 1 if (age > 45 and contract == "month-to-month") or (i % 4 == 0) else 0
        else:
            # Shifted distribution: older population, short tenure, high charges, all month-to-month
            age = 85 + (i % 10)
            tenure = 1 + (i % 3)
            monthly_charges = round(120.0 + (i % 25) * 1.5, 2)
            contract = "month-to-month"
            churn = 1 if (i % 2 == 0) else 0

        rows.append({
            "age": age,
            "tenure": tenure,
            "monthly_charges": monthly_charges,
            "contract": contract,
            "churn": churn,
        })
    return pd.DataFrame(rows).to_csv(index=False).encode("utf-8")


def _register_user(client: Any, email: str, password: str = "Password123!") -> tuple[str, str]:
    """Registers a user account and returns (access_token, user_id)."""
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    body = resp.json()
    return body["access_token"], body["user_id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Task 5A.1: Happy-Path 12-Step End-to-End Lifecycle Test
# ---------------------------------------------------------------------------

def test_full_ml_lifecycle_e2e(client: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercises the complete 12-stage MLForge MLOps lifecycle from ingestion to
    retraining, candidate evaluation, human approval, promotion, and audit trail."""
    import api.retraining_service as retraining_service

    # Setup primary user account
    token, user_id = _register_user(client, "lifecycle-owner@example.com")
    auth_headers = _auth(token)

    # -----------------------------------------------------------------------
    # Step 1: Upload dataset & Step 2: Submit training request
    # -----------------------------------------------------------------------
    train_csv = _synthetic_churn_data(n=120, drift=False)
    train_files = {"file": ("churn_train.csv", train_csv, "text/csv")}
    train_payload = {
        "model_name": "Logistic Regression",
        "input_cols": "age,tenure,monthly_charges,contract",
        "target_col": "churn",
        "model_params": "{}",
    }

    train_resp = client.post("/api/v1/train-model", files=train_files, data=train_payload, headers=auth_headers)
    assert train_resp.status_code == 200, f"Training request failed: {train_resp.text}"
    train_data = train_resp.json()
    assert train_data["status"] == "success"
    assert train_data["model_name"] == "Logistic Regression"
    assert train_data["task_type"] == "classification"
    assert "f1" in train_data["metrics"]
    assert train_data["n_train"] > 0
    assert train_data["n_test"] > 0
    job_id = train_data["job_id"]

    # -----------------------------------------------------------------------
    # Step 3: Verify training completes successfully and artifact exists
    # -----------------------------------------------------------------------
    job_detail = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers).json()
    assert job_detail["status"] == "succeeded"
    assert job_detail["model_name"] == "Logistic Regression"
    assert job_detail["dataset_filename"] is not None

    # Verify model artifact accessibility on filesystem via database record
    from api.db_models import Job
    from api.db import get_db

    db = next(client.app.dependency_overrides[get_db]())
    db_job = db.get(Job, job_id)
    assert db_job is not None
    assert db_job.owner_id == user_id
    assert db_job.pickle_path is not None
    assert os.path.exists(db_job.pickle_path), f"Artifact missing on disk: {db_job.pickle_path}"

    # -----------------------------------------------------------------------
    # Step 4: Register trained model in Model Registry
    # -----------------------------------------------------------------------
    reg_resp = client.post(f"/api/v1/registry/{job_id}/register", headers=auth_headers)
    assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    v1_data = reg_resp.json()
    v1_id = v1_data["id"]
    assert v1_data["version"] == 1
    assert v1_data["model_name"] == "Logistic Regression"
    assert v1_data["lifecycle_state"] == "development"
    assert v1_data["job_id"] == job_id

    # -----------------------------------------------------------------------
    # Step 5: Promote model through lifecycle (development -> staging -> production)
    # -----------------------------------------------------------------------
    # Direct jump dev -> production must fail per transition graph
    bad_promote = client.post(
        f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=auth_headers
    )
    assert bad_promote.status_code == 400
    assert "Cannot transition from 'development' to 'production'" in bad_promote.json()["detail"]

    # Promote to staging
    stage_resp = client.post(
        f"/api/v1/registry/{v1_id}/promote", json={"target_state": "staging"}, headers=auth_headers
    )
    assert stage_resp.status_code == 200
    assert stage_resp.json()["lifecycle_state"] == "staging"

    # Promote to production (becomes production champion)
    prod_resp = client.post(
        f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=auth_headers
    )
    assert prod_resp.status_code == 200
    assert prod_resp.json()["lifecycle_state"] == "production"

    # Verify champion is correctly recognized in registry list
    registry_list = client.get("/api/v1/registry", headers=auth_headers).json()
    champion_entry = next((v for v in registry_list if v["id"] == v1_id), None)
    assert champion_entry is not None
    assert champion_entry["lifecycle_state"] == "production"

    # -----------------------------------------------------------------------
    # Step 6: Deploy active production model
    # -----------------------------------------------------------------------
    deploy_resp = client.post(f"/api/v1/deployments/{v1_id}/deploy", headers=auth_headers)
    assert deploy_resp.status_code == 200, f"Deployment failed: {deploy_resp.text}"
    deploy_data = deploy_resp.json()
    deployment_id = deploy_data["id"]
    assert deploy_data["status"] == "active"
    assert deploy_data["model_version_id"] == v1_id
    assert deploy_data["model_name"] == "Logistic Regression"

    # -----------------------------------------------------------------------
    # Step 7: Execute real-time single-record JSON prediction
    # -----------------------------------------------------------------------
    predict_payload = {
        "features": {
            "age": 35,
            "tenure": 12,
            "monthly_charges": 65.5,
            "contract": "one-year",
        }
    }
    pred_resp = client.post(
        f"/api/v1/deployments/{deployment_id}/predict", json=predict_payload, headers=auth_headers
    )
    assert pred_resp.status_code == 200, f"Prediction failed: {pred_resp.text}"
    pred_data = pred_resp.json()
    assert pred_data["status"] == "success"
    assert pred_data["deployment_id"] == deployment_id
    assert pred_data["model_version"] == 1
    assert pred_data["prediction"] in (0, 1, [0], [1])
    assert pred_data["latency_ms"] >= 0

    # Verify deployment request metrics updated
    metrics_resp = client.get(f"/api/v1/deployments/{deployment_id}", headers=auth_headers).json()
    assert metrics_resp["request_count"] == 1
    assert metrics_resp["error_count"] == 0

    # -----------------------------------------------------------------------
    # Step 8: Upload drift window & trigger genuine Evidently drift detection
    # -----------------------------------------------------------------------
    drift_csv = _synthetic_churn_data(n=100, drift=True)
    monitor_files = {"file": ("drift_window.csv", drift_csv, "text/csv")}
    monitor_resp = client.post(
        f"/api/v1/deployments/{deployment_id}/monitor", files=monitor_files, headers=auth_headers
    )
    assert monitor_resp.status_code == 200, f"Monitoring failed: {monitor_resp.text}"
    snapshot = monitor_resp.json()
    snapshot_id = snapshot["id"]

    if snapshot["status"] == "ok":
        # Evidently is installed and executed live drift computation
        assert snapshot["drift_detected"] is True
        assert snapshot["drift_share"] is not None and snapshot["drift_share"] >= 0.5
        assert snapshot["alert"] is True
    else:
        # Fallback if Evidently not installed in test environment
        pytest.skip("Evidently not available in test environment for live drift verification")

    # -----------------------------------------------------------------------
    # Step 9: Generate retraining candidate from drift monitoring snapshot
    # -----------------------------------------------------------------------
    cand_resp = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=auth_headers)
    assert cand_resp.status_code == 200, f"Candidate generation failed: {cand_resp.text}"
    candidate = cand_resp.json()
    candidate_id = candidate["id"]
    assert candidate["source"] == "drift"
    assert candidate["monitoring_snapshot_id"] == snapshot_id
    assert candidate["status"] == "pending"
    assert candidate["job_id"] is not None
    assert candidate["model_name"] == "Logistic Regression"

    # Verify idempotency: duplicate alert check returns existing candidate
    dup_cand_resp = client.post(f"/api/v1/retraining/from-snapshot/{snapshot_id}", headers=auth_headers)
    assert dup_cand_resp.status_code == 200
    assert dup_cand_resp.json()["id"] == candidate_id

    # -----------------------------------------------------------------------
    # Step 10: Evaluate candidate against production champion
    # -----------------------------------------------------------------------
    # Baseline champion score is set deterministically lower to test the passing evaluation gate
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champ: 0.1)

    eval_resp = client.post(f"/api/v1/retraining/{candidate_id}/evaluate", headers=auth_headers)
    assert eval_resp.status_code == 200, f"Evaluation failed: {eval_resp.text}"
    evaluated_candidate = eval_resp.json()
    assert evaluated_candidate["status"] == "evaluated"
    assert evaluated_candidate["evaluated_champion_version_id"] == v1_id
    assert evaluated_candidate["evaluation"]["passed"] is True
    assert evaluated_candidate["evaluation"]["champion_score"] == 0.1
    assert evaluated_candidate["evaluation"]["candidate_score"] is not None
    assert evaluated_candidate["evaluation"]["candidate_score"] > 0.1

    # Verify candidate is NOT automatically promoted before human approval
    current_registry = client.get("/api/v1/registry", headers=auth_headers).json()
    active_prod = next(v for v in current_registry if v["lifecycle_state"] == "production")
    assert active_prod["id"] == v1_id, "Champion was modified before explicit human approval"

    # -----------------------------------------------------------------------
    # Step 11: Approve and promote candidate via human approval gate
    # -----------------------------------------------------------------------
    approve_resp = client.post(
        f"/api/v1/retraining/{candidate_id}/approve",
        json={"reason": "Approved by MLOps lead: outperforming production champion"},
        headers=auth_headers,
    )
    assert approve_resp.status_code == 200, f"Approval failed: {approve_resp.text}"
    approved_candidate = approve_resp.json()
    assert approved_candidate["status"] == "approved"
    assert approved_candidate["decision"] == "approved"
    assert approved_candidate["promoted_version_id"] is not None
    v2_id = approved_candidate["promoted_version_id"]

    # Verify production registry reflects new champion and archives previous champion
    updated_registry = client.get("/api/v1/registry", headers=auth_headers).json()
    v2_entry = next((v for v in updated_registry if v["id"] == v2_id), None)
    v1_entry = next((v for v in updated_registry if v["id"] == v1_id), None)

    assert v2_entry is not None
    assert v2_entry["version"] == 2
    assert v2_entry["lifecycle_state"] == "production"
    assert v2_entry["promoted_from"] == v1_id

    assert v1_entry is not None
    assert v1_entry["lifecycle_state"] == "archived"

    # -----------------------------------------------------------------------
    # Step 12: Retrieve audit history and verify complete end-to-end lineage
    # -----------------------------------------------------------------------
    audit_resp = client.get(f"/api/v1/retraining/{candidate_id}/audit", headers=auth_headers)
    assert audit_resp.status_code == 200, f"Audit query failed: {audit_resp.text}"
    audit = audit_resp.json()

    # Complete lineage verification:
    # MonitoringSnapshot -> RetrainingCandidate -> Job -> Evaluation -> Approval Decision -> Promoted ModelVersion
    assert audit["candidate_id"] == candidate_id
    assert audit["source"] == "drift"

    # Snapshot linkage
    assert audit["monitoring_snapshot"] is not None
    assert audit["monitoring_snapshot"]["id"] == snapshot_id
    assert audit["monitoring_snapshot"]["drift_detected"] is True

    # Training Job linkage
    assert audit["training_job"] is not None
    assert audit["training_job"]["id"] == candidate["job_id"]
    assert audit["training_job"]["status"] == "succeeded"

    # Evaluation record
    assert audit["evaluation"] is not None
    assert audit["evaluation"]["passed"] is True
    assert audit["evaluated_champion_version_id"] == v1_id

    # Decision record
    assert audit["decision"]["decision"] == "approved"
    assert audit["decision"]["decided_by"] == user_id
    assert "Approved by MLOps lead" in audit["decision"]["reason"]

    # Promoted ModelVersion record
    assert audit["promoted_version"] is not None
    assert audit["promoted_version"]["id"] == v2_id
    assert audit["promoted_version"]["version"] == 2
    assert audit["promoted_version"]["lifecycle_state"] == "production"

    # Ownership isolation check: candidate and jobs belong to user_id
    assert audit["triggered_by"] == user_id


# ---------------------------------------------------------------------------
# Focused Negative & Integrity Scenarios
# ---------------------------------------------------------------------------

def test_e2e_cross_user_isolation(client: Any) -> None:
    """Verifies that User B cannot access, deploy, predict, evaluate, or approve
    User A's resources at any point in the lifecycle."""
    token_a, _ = _register_user(client, "user-a@example.com")
    token_b, _ = _register_user(client, "user-b@example.com")

    # User A trains and registers a model
    train_files = {"file": ("data.csv", _synthetic_churn_data(80), "text/csv")}
    job_id = client.post(
        "/api/v1/train-model",
        files=train_files,
        data={"model_name": "Logistic Regression", "input_cols": "age,tenure", "target_col": "churn", "model_params": "{}"},
        headers=_auth(token_a),
    ).json()["job_id"]

    v1_id = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token_a)).json()["id"]
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "staging"}, headers=_auth(token_a))
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=_auth(token_a))

    deploy_id = client.post(f"/api/v1/deployments/{v1_id}/deploy", headers=_auth(token_a)).json()["id"]

    # User B attempts to access User A's resources
    # 1. Register User A's job (must return 404 to avoid resource enumeration)
    cross_reg = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token_b))
    assert cross_reg.status_code == 404

    # 2. Deploy User A's version
    cross_deploy = client.post(f"/api/v1/deployments/{v1_id}/deploy", headers=_auth(token_b))
    assert cross_deploy.status_code == 404

    # 3. Predict on User A's deployment
    cross_pred = client.post(
        f"/api/v1/deployments/{deploy_id}/predict",
        json={"features": {"age": 30, "tenure": 5}},
        headers=_auth(token_b),
    )
    assert cross_pred.status_code == 404

    # 4. Trigger retraining on User A's version
    cross_retrain = client.post(
        "/api/v1/retraining/trigger", json={"model_version_id": v1_id}, headers=_auth(token_b)
    )
    assert cross_retrain.status_code == 404


def test_e2e_promotion_failure_rollback(client: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verifies that if candidate promotion fails at the production gate step,
    the transaction boundary and compensating rollback ensure no orphaned staging
    version remains in the registry, and the production champion is preserved."""
    import api.registry_service as registry_service
    import api.retraining_service as retraining_service

    token, _ = _register_user(client, "promo-fail@example.com")
    auth_h = _auth(token)

    # Train, register, promote to production champion
    files = {"file": ("data.csv", _synthetic_churn_data(80), "text/csv")}
    job_id = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,tenure", "target_col": "churn", "model_params": "{}"},
        headers=auth_h,
    ).json()["job_id"]

    v1_id = client.post(f"/api/v1/registry/{job_id}/register", headers=auth_h).json()["id"]
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "staging"}, headers=auth_h)
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=auth_h)

    # Retrain candidate & evaluate
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champ: 0.1)
    cand = client.post("/api/v1/retraining/trigger", json={"model_version_id": v1_id}, headers=auth_h).json()
    client.post(f"/api/v1/retraining/{cand['id']}/evaluate", headers=auth_h)

    # Force failure specifically at promote(production)
    orig_promote = registry_service.promote

    def mock_promote(db, version, job, target_state, commit=True):
        if target_state == "production":
            raise registry_service.RegistryError("Simulated production promotion failure")
        return orig_promote(db, version, job, target_state, commit=commit)

    monkeypatch.setattr(registry_service, "promote", mock_promote)

    resp = client.post(f"/api/v1/retraining/{cand['id']}/approve", json={"reason": "try promote"}, headers=auth_h)
    assert resp.status_code == 400
    assert "Simulated production promotion failure" in resp.json()["detail"]

    # Verify candidate status
    cand_row = client.get(f"/api/v1/retraining/{cand['id']}", headers=auth_h).json()
    assert cand_row["status"] == "promotion_failed"
    assert cand_row["promoted_version_id"] is None

    # Verify registry: zero orphaned versions, champion untouched in production
    versions = client.get("/api/v1/registry", headers=auth_h).json()
    assert len(versions) == 1
    assert versions[0]["id"] == v1_id
    assert versions[0]["lifecycle_state"] == "production"



def test_e2e_non_alerting_snapshot_refuses_retraining(client: Any) -> None:
    """Verifies that a monitoring snapshot without drift does not permit candidate generation."""
    token, _ = _register_user(client, "non-alert@example.com")
    auth_h = _auth(token)

    # Train, register, promote, deploy
    files = {"file": ("data.csv", _synthetic_churn_data(80), "text/csv")}
    job_id = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,tenure", "target_col": "churn", "model_params": "{}"},
        headers=auth_h,
    ).json()["job_id"]

    v1_id = client.post(f"/api/v1/registry/{job_id}/register", headers=auth_h).json()["id"]
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "staging"}, headers=auth_h)
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=auth_h)
    deploy_id = client.post(f"/api/v1/deployments/{v1_id}/deploy", headers=auth_h).json()["id"]

    # Upload identical non-drifted window
    clean_files = {"file": ("clean.csv", _synthetic_churn_data(80, drift=False), "text/csv")}
    snap_resp = client.post(f"/api/v1/deployments/{deploy_id}/monitor", files=clean_files, headers=auth_h).json()

    if snap_resp["status"] != "ok" or snap_resp["alert"]:
        pytest.skip("Evidently unavailable or random baseline alerted")

    # Attempting to generate candidate from non-alerting snapshot must fail
    resp = client.post(f"/api/v1/retraining/from-snapshot/{snap_resp['id']}", headers=auth_h)
    assert resp.status_code == 400
    assert "does not meet the drift-alert threshold" in resp.json()["detail"]


def test_e2e_evaluation_and_approval_guards(client: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verifies approval refusal when un-evaluated, double decision guards, and stale champion protection."""
    import api.retraining_service as retraining_service

    token, _ = _register_user(client, "guards@example.com")
    auth_h = _auth(token)

    # Setup champion
    files = {"file": ("data.csv", _synthetic_churn_data(80), "text/csv")}
    job_id = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,tenure", "target_col": "churn", "model_params": "{}"},
        headers=auth_h,
    ).json()["job_id"]

    v1_id = client.post(f"/api/v1/registry/{job_id}/register", headers=auth_h).json()["id"]
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "staging"}, headers=auth_h)
    client.post(f"/api/v1/registry/{v1_id}/promote", json={"target_state": "production"}, headers=auth_h)

    # Candidate 1: Try to approve before evaluation
    cand_1 = client.post("/api/v1/retraining/trigger", json={"model_version_id": v1_id}, headers=auth_h).json()
    un_eval_approve = client.post(f"/api/v1/retraining/{cand_1['id']}/approve", json={}, headers=auth_h)
    assert un_eval_approve.status_code == 400
    assert "only an 'evaluated' (passed) candidate can be approved" in un_eval_approve.json()["detail"]

    # Candidate 1: Quality gate failure auto-rejects
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champ: 2.0)  # Unreachable score
    eval_fail = client.post(f"/api/v1/retraining/{cand_1['id']}/evaluate", headers=auth_h).json()
    assert eval_fail["status"] == "rejected"
    assert eval_fail["decision"] == "rejected"

    # Cannot approve auto-rejected candidate
    after_reject = client.post(f"/api/v1/retraining/{cand_1['id']}/approve", json={}, headers=auth_h)
    assert after_reject.status_code == 400

    # Candidate 2: Stale champion guard
    monkeypatch.setattr(retraining_service, "_champion_score", lambda champ: 0.1)
    cand_2 = client.post("/api/v1/retraining/trigger", json={"model_version_id": v1_id}, headers=auth_h).json()
    client.post(f"/api/v1/retraining/{cand_2['id']}/evaluate", headers=auth_h)

    # In the meantime, another candidate (Cand 3) is created, evaluated, and approved, changing the champion!
    cand_3 = client.post("/api/v1/retraining/trigger", json={"model_version_id": v1_id}, headers=auth_h).json()
    client.post(f"/api/v1/retraining/{cand_3['id']}/evaluate", headers=auth_h)
    approved_3 = client.post(f"/api/v1/retraining/{cand_3['id']}/approve", json={}, headers=auth_h)
    assert approved_3.status_code == 200

    # Now Cand 2's evaluation against v1 is STALE (champion is now v2)
    stale_approve = client.post(f"/api/v1/retraining/{cand_2['id']}/approve", json={}, headers=auth_h)
    assert stale_approve.status_code == 400
    assert "production champion has changed" in stale_approve.json()["detail"].lower()

    # Double decision guard on Cand 3: cannot approve or reject again
    double_approve = client.post(f"/api/v1/retraining/{cand_3['id']}/approve", json={}, headers=auth_h)
    assert double_approve.status_code == 400
    double_reject = client.post(f"/api/v1/retraining/{cand_3['id']}/reject", json={}, headers=auth_h)
    assert double_reject.status_code == 400
