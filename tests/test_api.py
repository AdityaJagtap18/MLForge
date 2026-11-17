import io

import pandas as pd
import pytest


def _csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False).encode()


def _classification_csv():
    rows = [{"age": 20 + (i % 40), "city": ["NY", "LA", "SF"][i % 3], "label": i % 2} for i in range(60)]
    return _csv_bytes(pd.DataFrame(rows))


def test_health_reports_real_dependency_state(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["model_catalog"] == "ok"


def test_get_models_returns_catalog(client):
    """BUG-01 regression test: GET /models used to throw FileNotFoundError."""
    resp = client.get("/api/v1/models")
    assert resp.status_code == 200
    assert "Logistic Regression" in resp.json()["models"]


def test_train_model_success_and_no_stack_trace_on_bad_column(client):
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={
            "model_name": "Logistic Regression",
            "input_cols": "age,city",
            "target_col": "label",
            "model_params": "{}",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_type"] == "classification"
    job_id = body["job_id"]

    # BUG-05 regression: a bad column must come back as a clean 400, never a
    # raw Python traceback string.
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    bad_resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={
            "model_name": "Logistic Regression",
            "input_cols": "age,not_a_real_column",
            "target_col": "label",
            "model_params": "{}",
        },
    )
    assert bad_resp.status_code == 400
    detail = bad_resp.json()["detail"]
    assert "Traceback" not in detail
    assert "not_a_real_column" in detail

    return job_id


def test_predict_uses_trained_job(client):
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    train_resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={
            "model_name": "Logistic Regression",
            "input_cols": "age,city",
            "target_col": "label",
            "model_params": "{}",
        },
    )
    job_id = train_resp.json()["job_id"]

    predict_files = {"file": ("new.csv", _classification_csv(), "text/csv")}
    predict_resp = client.post("/api/v1/predict", files=predict_files, data={"job_id": job_id})
    assert predict_resp.status_code == 200
    predictions = predict_resp.json()["predictions"]
    assert len(predictions) == 60


def test_predict_with_unknown_job_id_returns_404_not_500(client):
    predict_files = {"file": ("new.csv", _classification_csv(), "text/csv")}
    resp = client.post("/api/v1/predict", files=predict_files, data={"job_id": "does-not-exist"})
    assert resp.status_code == 404


def test_jobs_endpoint_lists_completed_runs(client):
    """Closes the FR-LOG gap: logs.html previously had nothing to call."""
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    client.post(
        "/api/v1/train-model",
        files=files,
        data={
            "model_name": "Logistic Regression",
            "input_cols": "age,city",
            "target_col": "label",
            "model_params": "{}",
        },
    )
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 200
    jobs = resp.json()
    assert len(jobs) >= 1
    assert jobs[0]["job_type"] == "train"


def test_write_endpoints_require_api_key_when_configured(client, monkeypatch):
    import api.deps as deps_module

    monkeypatch.setattr(deps_module, "API_KEY", "secret-123")
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 401
    resp = client.get("/api/v1/jobs", headers={"X-API-Key": "secret-123"})
    assert resp.status_code == 200
