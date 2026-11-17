from __future__ import annotations

import pandas as pd
import pytest

from api.db_models import Deployment, Job, ModelVersion, MonitoringSnapshot, RetrainingCandidate
from api.main import app


def _get_test_db():
    from api.db import get_db
    return next(app.dependency_overrides[get_db]())


def _register(client, email: str, password: str = "password123") -> tuple[str, str]:
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], data["user_id"]


def _train(client, token: str, model_name: str = "Logistic Regression") -> str:
    df = pd.DataFrame({"age": [20, 30, 40, 50, 60], "city": ["NY", "LA", "NY", "SF", "LA"], "label": [0, 1, 0, 1, 0]})
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"target_col": "label", "model_name": model_name, "input_cols": "age,city", "model_params": "{}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    return resp.json()["job_id"]


def _register_model(client, token: str, job_id: str) -> str:
    resp = client.post(f"/api/v1/registry/{job_id}/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    return resp.json()["id"]


def test_overview_empty_database(client):
    """Empty database test: when no models, jobs, or deployments exist for a user,
    aggregations return valid zero/empty structures without errors."""
    token, _ = _register(client, "overview-empty@example.com")
    resp = client.get("/api/v1/overview", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["models"]["total_registered"] == 0
    assert data["models"]["by_stage"] == {"development": 0, "staging": 0, "production": 0, "archived": 0}
    assert data["models"]["production_champion"] is None

    assert data["experiments"]["total"] == 0
    assert data["experiments"]["active"] == 0
    assert data["experiments"]["succeeded"] == 0

    assert data["deployments"]["total"] == 0
    assert data["deployments"]["active"] == 0

    assert data["drift_alerts"]["total"] == 0
    assert data["drift_alerts"]["active"] == 0
    assert data["drift_alerts"]["resolved"] == 0
    assert data["drift_alerts"]["recent_alerts"] == []

    assert isinstance(data["training_activity"], list)
    assert len(data["training_activity"]) == 14
    assert all(p["count"] == 0 for p in data["training_activity"])

    assert data["system_health"]["api"] == "ok"
    assert data["system_health"]["database"] == "ok"


def test_overview_multiple_lifecycle_states(client):
    """Multiple lifecycle states test: verifies models are categorized into
    development, staging, production, and archived correctly."""
    token, _ = _register(client, "overview-lifecycle@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Train and register model 1 -> development
    j1 = _train(client, token)
    v1 = _register_model(client, token, j1)

    # 2. Train and register model 2 -> stage -> promote to production
    j2 = _train(client, token)
    v2 = _register_model(client, token, j2)
    client.post(f"/api/v1/registry/{v2}/promote", json={"target_state": "staging"}, headers=headers)
    client.post(f"/api/v1/registry/{v2}/promote", json={"target_state": "production"}, headers=headers)

    # 3. Train and register model 3 -> stage
    j3 = _train(client, token)
    v3 = _register_model(client, token, j3)
    client.post(f"/api/v1/registry/{v3}/promote", json={"target_state": "staging"}, headers=headers)

    resp = client.get("/api/v1/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["models"]["total_registered"] == 3
    assert data["models"]["by_stage"]["development"] == 1
    assert data["models"]["by_stage"]["staging"] == 1
    assert data["models"]["by_stage"]["production"] == 1
    assert data["models"]["by_stage"]["archived"] == 0
    assert "Logistic Regression" in (data["models"]["production_champion"] or "")


def test_overview_experiments_and_active_counts(client):
    """Experiments and active count test: ensures active (pending/running) vs
    completed (succeeded/failed) jobs are aggregated properly."""
    token, user_id = _register(client, "overview-experiments@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Train completed job
    _train(client, token)

    db = _get_test_db()
    running_job = Job(
        owner_id=user_id,
        job_type="train",
        status="running",
        model_name="Random Forest Classifier",
    )
    db.add(running_job)
    db.commit()

    resp = client.get("/api/v1/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["experiments"]["total"] == 2
    assert data["experiments"]["active"] == 1
    assert data["experiments"]["succeeded"] == 1


def test_overview_deployments_and_drift_alerts_status(client):
    """Drift alert status tests: verifies alertable snapshots are detected,
    and active vs resolved alerts are differentiated based on candidate decisions
    and deployment state."""
    token, user_id = _register(client, "overview-drift@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create deployed model
    j = _train(client, token)
    v = _register_model(client, token, j)
    client.post(f"/api/v1/registry/{v}/promote", json={"target_state": "staging"}, headers=headers)
    deploy_resp = client.post(f"/api/v1/deployments/{v}/deploy", headers=headers)
    assert deploy_resp.status_code == 200
    dep_id = deploy_resp.json()["id"]

    db = _get_test_db()

    # 1. Add alertable snapshot 1 -> resolved via approved candidate
    s1 = MonitoringSnapshot(
        deployment_id=dep_id,
        drift_type="data_drift",
        n_rows=100,
        drift_detected=True,
        drift_share=0.8,
        status="ok",
    )
    db.add(s1)
    db.commit()
    db.refresh(s1)

    cand1 = RetrainingCandidate(
        owner_id=user_id,
        model_name="Logistic Regression",
        source="drift",
        job_id=j,
        monitoring_snapshot_id=s1.id,
        status="approved",
        decision="approved",
    )
    db.add(cand1)

    # 2. Add alertable snapshot 2 -> active (no candidate yet)
    s2 = MonitoringSnapshot(
        deployment_id=dep_id,
        drift_type="data_drift",
        n_rows=100,
        drift_detected=True,
        drift_share=0.6,
        status="ok",
    )
    db.add(s2)

    # 3. Add non-alerting snapshot 3 -> healthy, should not increment drift alerts
    s3 = MonitoringSnapshot(
        deployment_id=dep_id,
        drift_type="data_drift",
        n_rows=100,
        drift_detected=False,
        drift_share=0.1,
        status="ok",
    )
    db.add(s3)
    db.commit()

    resp = client.get("/api/v1/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Deployments
    assert data["deployments"]["total"] == 1
    assert data["deployments"]["active"] == 1

    # Drift Alerts
    assert data["drift_alerts"]["total"] == 2
    assert data["drift_alerts"]["active"] == 1
    assert data["drift_alerts"]["resolved"] == 1
    assert len(data["drift_alerts"]["recent_alerts"]) == 2


def test_overview_tenant_isolation(client):
    """Tenant isolation: User A's activity must not be visible to User B."""
    token_a, _ = _register(client, "overview-user-a@example.com")
    token_b, _ = _register(client, "overview-user-b@example.com")

    # User A trains a model
    j_a = _train(client, token_a)
    _register_model(client, token_a, j_a)

    # User B checks overview
    resp_b = client.get("/api/v1/overview", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 200
    data_b = resp_b.json()

    assert data_b["models"]["total_registered"] == 0
    assert data_b["experiments"]["total"] == 0


def test_overview_past_jobs_outside_14_day_window(client):
    """Jobs older than 14 days with naive datetimes must not crash or distort rolling window."""
    from datetime import datetime, timedelta
    token, user_id = _register(client, "overview-past-jobs@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    db = _get_test_db()
    old_job = Job(
        owner_id=user_id,
        job_type="train",
        status="succeeded",
        model_name="Old Random Forest",
        created_at=datetime.utcnow() - timedelta(days=25),  # naive datetime 25 days ago
    )
    db.add(old_job)
    db.commit()

    resp = client.get("/api/v1/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["experiments"]["total"] == 1
    assert len(data["training_activity"]) == 14
    # All 14 days in window must be 0 because the job was 25 days ago
    assert all(p["count"] == 0 for p in data["training_activity"])
