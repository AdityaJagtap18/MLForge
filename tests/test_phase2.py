import pandas as pd


def _classification_csv():
    rows = [{"age": 20 + (i % 40), "city": ["NY", "LA", "SF"][i % 3], "label": i % 2} for i in range(60)]
    return pd.DataFrame(rows).to_csv(index=False).encode()


def _register(client, email="a@example.com", password="password123"):
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _train(client, token):
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,city", "target_col": "label", "model_params": "{}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    return resp.json()["job_id"]


def test_register_and_login(client):
    token = _register(client)
    assert token

    resp = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert resp.status_code == 200
    assert resp.json()["access_token"]

    bad = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "wrong"})
    assert bad.status_code == 401


def test_jobs_are_scoped_to_owner(client):
    token_a = _register(client, "owner-a@example.com")
    token_b = _register(client, "owner-b@example.com")

    job_id = _train(client, token_a)

    # Owner A sees their own job.
    resp_a = client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token_a}"})
    assert any(j["id"] == job_id for j in resp_a.json())

    # Owner B must not see it, and a direct fetch by id is a 404, not a 403
    # (never confirm another user's job_id exists).
    resp_b = client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token_b}"})
    assert not any(j["id"] == job_id for j in resp_b.json())

    detail_b = client.get(f"/api/v1/jobs/{job_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert detail_b.status_code == 404


def test_dataset_profile_reports_quality_signals(client):
    token = _register(client)
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile",
        files=files,
        data={"target_col": "label"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_rows"] == 60
    assert body["target_column"] == "label"


def test_registry_register_and_promote_requires_quality_gate(client, monkeypatch):
    import api.registry_service as registry_service

    monkeypatch.setattr(registry_service, "_MIN_PROMOTION_SCORE", 2.0)  # unreachable, forces the gate to fail

    token = _register(client)
    job_id = _train(client, token)

    reg_resp = client.post(f"/api/v1/registry/{job_id}/register", headers={"Authorization": f"Bearer {token}"})
    assert reg_resp.status_code == 200
    version_id = reg_resp.json()["id"]
    assert reg_resp.json()["lifecycle_state"] == "development"

    promote_resp = client.post(
        f"/api/v1/registry/{version_id}/promote",
        json={"target_state": "production"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert promote_resp.status_code == 400
    assert "Quality gate" in promote_resp.json()["detail"]


def test_registry_promote_succeeds_with_gate_disabled(client, monkeypatch):
    import api.registry_service as registry_service

    monkeypatch.setattr(registry_service, "_MIN_PROMOTION_SCORE", 0.0)

    token = _register(client)
    job_id = _train(client, token)
    version_id = client.post(f"/api/v1/registry/{job_id}/register", headers={"Authorization": f"Bearer {token}"}).json()["id"]

    promote_resp = client.post(
        f"/api/v1/registry/{version_id}/promote",
        json={"target_state": "production"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert promote_resp.status_code == 200
    assert promote_resp.json()["lifecycle_state"] == "production"
