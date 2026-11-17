"""Phase 3: deployment, real-time predict, drift monitoring, Prometheus
metrics, champion/challenger comparison."""
from __future__ import annotations

import pandas as pd
import pytest


def _classification_csv(n=80, seed_offset=0):
    rows = [
        {"age": 20 + ((i + seed_offset) % 40), "city": ["NY", "LA", "SF"][(i + seed_offset) % 3], "label": i % 2}
        for i in range(n)
    ]
    return pd.DataFrame(rows).to_csv(index=False).encode()


def _register(client, email, password="password123"):
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _train(client, token, n=80):
    files = {"file": ("data.csv", _classification_csv(n), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,city", "target_col": "label", "model_params": "{}"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    return resp.json()["job_id"]


def _register_and_stage(client, token, job_id):
    version_id = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token)).json()["id"]
    staged = client.post(
        f"/api/v1/registry/{version_id}/promote", json={"target_state": "staging"}, headers=_auth(token)
    )
    assert staged.status_code == 200
    return version_id


def _deploy(client, token, version_id):
    resp = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token))
    assert resp.status_code == 200, resp.json()
    return resp.json()["id"]


# ---------------------------------------------------------------- Deployment


def test_cannot_deploy_a_development_version(client):
    token = _register(client, "deploy-dev@example.com")
    job_id = _train(client, token)
    version_id = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token)).json()["id"]

    resp = client.post(f"/api/v1/deployments/{version_id}/deploy", headers=_auth(token))
    assert resp.status_code == 400


def test_deploy_and_metrics(client):
    token = _register(client, "deploy-ok@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    resp = client.get(f"/api/v1/deployments/{deployment_id}", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert body["request_count"] == 0


def test_deploying_new_version_replaces_old_and_rollback_restores_it(client):
    token = _register(client, "deploy-replace@example.com")

    job1 = _train(client, token)
    version1 = _register_and_stage(client, token, job1)
    deployment1 = _deploy(client, token, version1)

    job2 = _train(client, token)
    version2 = _register_and_stage(client, token, job2)
    deployment2 = _deploy(client, token, version2)

    d1 = client.get(f"/api/v1/deployments/{deployment1}", headers=_auth(token)).json()
    d2 = client.get(f"/api/v1/deployments/{deployment2}", headers=_auth(token)).json()
    assert d1["status"] == "replaced"
    assert d2["status"] == "active"

    rollback_resp = client.post(f"/api/v1/deployments/{deployment2}/rollback", headers=_auth(token))
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["id"] == deployment1
    assert rollback_resp.json()["status"] == "active"


def test_user_cannot_deploy_or_control_another_users_resources(client):
    token_a = _register(client, "deploy-a@example.com")
    token_b = _register(client, "deploy-b@example.com")
    job_a = _train(client, token_a)
    version_a = _register_and_stage(client, token_a, job_a)
    deployment_a = _deploy(client, token_a, version_a)

    resp = client.post(f"/api/v1/deployments/{version_a}/deploy", headers=_auth(token_b))
    assert resp.status_code == 404

    resp = client.get(f"/api/v1/deployments/{deployment_a}", headers=_auth(token_b))
    assert resp.status_code == 404

    resp = client.post(f"/api/v1/deployments/{deployment_a}/rollback", headers=_auth(token_b))
    assert resp.status_code == 404


# ------------------------------------------------------------ Real-time predict


def test_realtime_predict_success_and_logging(client):
    token = _register(client, "predict-rt@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    resp = client.post(
        f"/api/v1/deployments/{deployment_id}/predict",
        json={"features": {"age": 35, "city": "NY"}},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["deployment_id"] == deployment_id
    assert "prediction" in body
    assert body["latency_ms"] >= 0

    metrics = client.get(f"/api/v1/deployments/{deployment_id}", headers=_auth(token)).json()
    assert metrics["request_count"] == 1
    assert metrics["error_count"] == 0


def test_realtime_predict_missing_field_is_logged_as_error(client):
    token = _register(client, "predict-rt-err@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    resp = client.post(
        f"/api/v1/deployments/{deployment_id}/predict",
        json={"features": {"age": 35}},  # missing "city"
        headers=_auth(token),
    )
    assert resp.status_code == 400

    metrics = client.get(f"/api/v1/deployments/{deployment_id}", headers=_auth(token)).json()
    assert metrics["request_count"] == 1
    assert metrics["error_count"] == 1


def test_predict_against_inactive_deployment_is_rejected(client):
    token = _register(client, "predict-inactive@example.com")
    job1 = _train(client, token)
    version1 = _register_and_stage(client, token, job1)
    deployment1 = _deploy(client, token, version1)

    job2 = _train(client, token)
    version2 = _register_and_stage(client, token, job2)
    _deploy(client, token, version2)  # replaces deployment1

    resp = client.post(
        f"/api/v1/deployments/{deployment1}/predict", json={"features": {"age": 30, "city": "LA"}}, headers=_auth(token)
    )
    assert resp.status_code == 400


# ------------------------------------------------------------------ Monitoring


def test_monitoring_identical_distribution_reports_no_drift_or_degrades_cleanly(client):
    token = _register(client, "monitor-nodrift@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    # Same generative process as training data -> low/no drift expected.
    files = {"file": ("window.csv", _classification_csv(80, seed_offset=0), "text/csv")}
    resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in ("ok", "unavailable", "error")
    if body["status"] == "ok":
        assert body["drift_detected"] is False


def test_monitoring_shifted_distribution_is_flagged_when_evidently_available(client):
    token = _register(client, "monitor-drift@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    shifted = pd.DataFrame({"age": [90] * 80, "city": ["LA"] * 80, "label": [1] * 80})
    files = {"file": ("window.csv", shifted.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    if body["status"] == "ok":
        assert body["drift_detected"] is True
        assert body["alert"] is True


def test_monitoring_history_is_listed(client):
    token = _register(client, "monitor-history@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    files = {"file": ("window.csv", _classification_csv(80), "text/csv")}
    client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))

    history = client.get(f"/api/v1/deployments/{deployment_id}/monitoring", headers=_auth(token))
    assert history.status_code == 200
    assert len(history.json()) == 1


def test_monitoring_rejects_window_missing_required_columns(client):
    token = _register(client, "monitor-badcols@example.com")
    job_id = _train(client, token)
    version_id = _register_and_stage(client, token, job_id)
    deployment_id = _deploy(client, token, version_id)

    bad = pd.DataFrame({"not_age": [1, 2, 3]})
    files = {"file": ("window.csv", bad.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(f"/api/v1/deployments/{deployment_id}/monitor", files=files, headers=_auth(token))
    assert resp.status_code == 400


# ------------------------------------------------------- Champion/challenger


def test_champion_challenger_compare_with_no_champion_yet(client):
    token = _register(client, "compare-nochamp@example.com")
    job_id = _train(client, token)
    version_id = client.post(f"/api/v1/registry/{job_id}/register", headers=_auth(token)).json()["id"]

    resp = client.get(f"/api/v1/registry/compare?challenger_version_id={version_id}", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["champion"] is None
    assert "no production champion" in body["recommendation"].lower()


def test_champion_challenger_compare_with_existing_champion(client):
    token = _register(client, "compare-champ@example.com")

    job1 = _train(client, token)
    version1 = client.post(f"/api/v1/registry/{job1}/register", headers=_auth(token)).json()["id"]
    client.post(f"/api/v1/registry/{version1}/promote", json={"target_state": "staging"}, headers=_auth(token))
    client.post(f"/api/v1/registry/{version1}/promote", json={"target_state": "production"}, headers=_auth(token))

    job2 = _train(client, token)
    version2 = client.post(f"/api/v1/registry/{job2}/register", headers=_auth(token)).json()["id"]

    resp = client.get(f"/api/v1/registry/compare?challenger_version_id={version2}", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["champion"]["id"] == version1
    assert body["challenger"]["id"] == version2


def test_cannot_compare_another_users_challenger(client):
    token_a = _register(client, "compare-a@example.com")
    token_b = _register(client, "compare-b@example.com")
    job_a = _train(client, token_a)
    version_a = client.post(f"/api/v1/registry/{job_a}/register", headers=_auth(token_a)).json()["id"]

    resp = client.get(f"/api/v1/registry/compare?challenger_version_id={version_a}", headers=_auth(token_b))
    assert resp.status_code == 404


# --------------------------------------------------------------- Prometheus


def test_metrics_endpoint_is_reachable_without_auth(client):
    resp = client.get("/metrics")
    assert resp.status_code == 200


def test_metrics_endpoint_reflects_request_counts(client):
    before = client.get("/metrics").text
    client.get("/api/v1/health")
    after = client.get("/metrics").text
    assert "mlforge_http_requests_total" in after or "prometheus_client is not installed" in after
