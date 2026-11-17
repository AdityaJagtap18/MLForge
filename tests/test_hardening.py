"""Phase 2 hardening pass: security + reliability regression tests.

Written and reviewed, NOT executed -- no Python interpreter has been
available in any session that has worked on this repo. Run `pytest` and
report back before trusting any of these.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest


def _classification_csv(n=60):
    rows = [{"age": 20 + (i % 40), "city": ["NY", "LA", "SF"][i % 3], "label": i % 2} for i in range(n)]
    return pd.DataFrame(rows).to_csv(index=False).encode()


def _register(client, email, password="password123"):
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _train(client, token, model_name="Logistic Regression"):
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": model_name, "input_cols": "age,city", "target_col": "label", "model_params": "{}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    return resp.json()["job_id"]


def _register_model(client, token, job_id):
    resp = client.post(f"/api/v1/registry/{job_id}/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    return resp.json()["id"]


def _stage(client, token, version_id):
    resp = client.post(
        f"/api/v1/registry/{version_id}/promote",
        json={"target_state": "staging"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    return resp.json()


def _promote_to_production(client, token, version_id):
    resp = client.post(
        f"/api/v1/registry/{version_id}/promote",
        json={"target_state": "production"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.json()
    return resp.json()


# ---------------------------------------------------------------- Auth


def test_duplicate_registration_is_rejected(client):
    _register(client, "dup@example.com")
    resp = client.post("/api/v1/auth/register", json={"email": "dup@example.com", "password": "password123"})
    assert resp.status_code == 400


def test_token_revocation_via_logout(client):
    token = _register(client, "logout@example.com")
    resp = client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200

    logout_resp = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_resp.status_code == 200
    assert logout_resp.json()["revoked"] is True

    after = client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token}"})
    assert after.status_code == 401

    # Revoking the same token twice is a clean no-op, not a 500.
    second_logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert second_logout.status_code == 200
    assert second_logout.json()["revoked"] is False


def test_expired_token_cannot_authenticate(client):
    import api.auth as auth_module
    from api.db_models import AccessToken

    token = _register(client, "expiry@example.com")

    # Force the token's expiry into the past, bypassing the normal 30-day
    # TTL. The client fixture overrides get_db with its own session
    # factory; grab a session the same way a request would, via that override.
    from api.db import get_db
    from api.main import app

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        access_token = db.query(AccessToken).filter(AccessToken.token_hash == auth_module._hash_token(token)).first()
        assert access_token is not None
        access_token.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/v1/jobs", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_production_mode_never_allows_unauthenticated_access(client, monkeypatch):
    import api.deps as deps_module

    monkeypatch.setattr(deps_module, "IS_PRODUCTION", True)
    monkeypatch.setattr(deps_module, "API_KEY", None)

    # No users exist yet in this test's fresh DB either -- in development
    # mode this would hit the local-dev bypass; in production it must not.
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 401


def test_development_mode_bypass_still_works_for_local_dev(client, monkeypatch):
    import api.deps as deps_module

    monkeypatch.setattr(deps_module, "IS_PRODUCTION", False)
    monkeypatch.setattr(deps_module, "API_KEY", None)

    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 200


# ------------------------------------------------------------ Ownership


def test_user_cannot_predict_with_another_users_model(client):
    token_a = _register(client, "predict-a@example.com")
    token_b = _register(client, "predict-b@example.com")
    job_id = _train(client, token_a)

    files = {"file": ("new.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/predict", files=files, data={"job_id": job_id}, headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 404


def test_registry_version_numbering_is_scoped_per_owner(client):
    """Two different users registering a model with the same catalog name
    must each start at version 1 -- a shared counter would leak information
    about (and let one user influence) another user's version numbers."""
    token_a = _register(client, "reg-a@example.com")
    token_b = _register(client, "reg-b@example.com")

    job_a = _train(client, token_a)
    job_b = _train(client, token_b)

    version_a1 = client.post(f"/api/v1/registry/{job_a}/register", headers={"Authorization": f"Bearer {token_a}"})
    version_b1 = client.post(f"/api/v1/registry/{job_b}/register", headers={"Authorization": f"Bearer {token_b}"})
    assert version_a1.json()["version"] == 1
    assert version_b1.json()["version"] == 1

    job_a2 = _train(client, token_a)
    version_a2 = client.post(f"/api/v1/registry/{job_a2}/register", headers={"Authorization": f"Bearer {token_a}"})
    assert version_a2.json()["version"] == 2  # A's own second version, unaffected by B


def test_user_cannot_see_another_users_registry_versions(client):
    token_a = _register(client, "list-a@example.com")
    token_b = _register(client, "list-b@example.com")
    job_a = _train(client, token_a)
    version_a = _register_model(client, token_a, job_a)

    resp_b = client.get("/api/v1/registry", headers={"Authorization": f"Bearer {token_b}"})
    assert not any(v["id"] == version_a for v in resp_b.json())


def test_user_cannot_promote_or_rollback_another_users_version(client):
    token_a = _register(client, "promote-a@example.com")
    token_b = _register(client, "promote-b@example.com")
    job_a = _train(client, token_a)
    version_a = _register_model(client, token_a, job_a)

    promote_resp = client.post(
        f"/api/v1/registry/{version_a}/promote",
        json={"target_state": "staging"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert promote_resp.status_code == 404

    rollback_resp = client.post(f"/api/v1/registry/{version_a}/rollback", headers={"Authorization": f"Bearer {token_b}"})
    assert rollback_resp.status_code == 404


def test_promotion_to_production_only_archives_same_owners_prior_production(client):
    """Regression test for the cross-user production-archival bug: user A
    promoting a new version to production must never touch user B's
    production model, even if both happen to use the same catalog model
    name."""
    token_a = _register(client, "prod-a@example.com")
    token_b = _register(client, "prod-b@example.com")

    job_a1 = _train(client, token_a)
    version_a1 = _register_model(client, token_a, job_a1)
    _stage(client, token_a, version_a1)
    _promote_to_production(client, token_a, version_a1)

    job_b1 = _train(client, token_b)
    version_b1 = _register_model(client, token_b, job_b1)
    _stage(client, token_b, version_b1)
    _promote_to_production(client, token_b, version_b1)

    # Now A promotes a second version to production -- B's production must
    # be untouched.
    job_a2 = _train(client, token_a)
    version_a2 = _register_model(client, token_a, job_a2)
    _stage(client, token_a, version_a2)
    _promote_to_production(client, token_a, version_a2)

    b_versions = client.get("/api/v1/registry", headers={"Authorization": f"Bearer {token_b}"}).json()
    b_version_1 = next(v for v in b_versions if v["id"] == version_b1)
    assert b_version_1["lifecycle_state"] == "production"  # untouched by A's promotion

    a_versions = client.get("/api/v1/registry", headers={"Authorization": f"Bearer {token_a}"}).json()
    a_version_1 = next(v for v in a_versions if v["id"] == version_a1)
    assert a_version_1["lifecycle_state"] == "archived"  # A's own prior production was archived


# -------------------------------------------------------------- Registry


def test_rollback_restores_prior_production_and_archives_current(client):
    token = _register(client, "rollback@example.com")
    job1 = _train(client, token)
    version1 = _register_model(client, token, job1)
    _stage(client, token, version1)
    _promote_to_production(client, token, version1)

    job2 = _train(client, token)
    version2 = _register_model(client, token, job2)
    _stage(client, token, version2)
    _promote_to_production(client, token, version2)

    rollback_resp = client.post(f"/api/v1/registry/{version2}/rollback", headers={"Authorization": f"Bearer {token}"})
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["id"] == version1
    assert rollback_resp.json()["lifecycle_state"] == "production"

    versions = {v["id"]: v for v in client.get("/api/v1/registry", headers={"Authorization": f"Bearer {token}"}).json()}
    assert versions[version1]["lifecycle_state"] == "production"
    assert versions[version2]["lifecycle_state"] == "archived"


def test_rollback_without_prior_production_is_rejected(client):
    token = _register(client, "no-rollback@example.com")
    job1 = _train(client, token)
    version1 = _register_model(client, token, job1)
    _stage(client, token, version1)
    _promote_to_production(client, token, version1)

    resp = client.post(f"/api/v1/registry/{version1}/rollback", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


# -------------------------------------------------------------- MLflow


def test_training_succeeds_even_when_mlflow_adapter_errors(client, monkeypatch):
    """Training must not fail just because tracking fails -- simulate a
    tracking-backend error (not just "not installed") and confirm the job
    still succeeds, with tracking_status reflecting the failure honestly."""
    import api.integrations.mlflow_adapter as mlflow_adapter

    def _boom(*args, **kwargs):
        raise RuntimeError("tracking backend unreachable (simulated)")

    monkeypatch.setattr(mlflow_adapter, "_get_mlflow", _boom)

    token = _register(client, "mlflow-fail@example.com")
    files = {"file": ("data.csv", _classification_csv(), "text/csv")}
    resp = client.post(
        "/api/v1/train-model",
        files=files,
        data={"model_name": "Logistic Regression", "input_cols": "age,city", "target_col": "label", "model_params": "{}"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]

    job = client.get(f"/api/v1/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"}).json()
    assert job["status"] == "succeeded"
    assert job["tracking_status"] in ("error", "unavailable")


def test_training_succeeds_when_mlflow_not_installed(client):
    """Default state of this environment: mlflow likely isn't importable at
    all. Training must still succeed end to end."""
    token = _register(client, "mlflow-missing@example.com")
    job_id = _train(client, token)
    job = client.get(f"/api/v1/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"}).json()
    assert job["status"] == "succeeded"
    assert job["tracking_status"] in ("ok", "unavailable", "error")


# ---------------------------------------------------------- Dataset profiling


def test_profile_detects_missing_values_and_constant_columns(client):
    token = _register(client, "profile-missing@example.com")
    df = pd.DataFrame(
        {
            "a": [1, 2, None, 4, 5],
            "b": [1, 1, 1, 1, 1],  # constant
            "label": [0, 1, 0, 1, 0],
        }
    )
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile",
        files=files,
        data={"target_col": "label"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "b" in body["constant_columns"]
    col_a = next(c for c in body["columns"] if c["name"] == "a")
    assert col_a["missing_count"] == 1


def test_profile_detects_duplicate_rows(client):
    token = _register(client, "profile-dup@example.com")
    df = pd.DataFrame({"a": [1, 1, 2, 3], "label": [0, 0, 1, 1]})
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile", files=files, data={"target_col": "label"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.json()["duplicate_rows"] == 1


def test_profile_detects_class_imbalance(client):
    token = _register(client, "profile-imbalance@example.com")
    df = pd.DataFrame({"a": list(range(100)), "label": [0] * 95 + [1] * 5})
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile", files=files, data={"target_col": "label"}, headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    assert body["class_imbalance_ratio"] is not None
    assert body["class_imbalance_ratio"] >= 10


def test_profile_regression_target_reports_distribution_not_class_counts(client):
    token = _register(client, "profile-regression@example.com")
    df = pd.DataFrame({"a": list(range(60)), "y": [v * 1.5 for v in range(60)]})
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile", files=files, data={"target_col": "y"}, headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    assert set(body["target_distribution"].keys()) == {"min", "max", "mean", "std"}


def test_profile_warns_on_suspiciously_correlated_leakage_column(client):
    token = _register(client, "profile-leak@example.com")
    df = pd.DataFrame({"x": list(range(60)), "y": [v * 2 for v in range(60)]})  # y is a perfect function of x... wait target
    # Make a column that is literally the target to trigger the correlation heuristic.
    df["leaky"] = df["y"]
    files = {"file": ("data.csv", df.to_csv(index=False).encode(), "text/csv")}
    resp = client.post(
        "/api/v1/datasets/profile", files=files, data={"target_col": "y"}, headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    assert any("leaky" in w for w in body["leakage_warnings"])


def test_profile_does_not_mutate_caller_dataframe():
    from ml_core.dataset_profile import profile_dataset

    df = pd.DataFrame({"a": [1, 2, None], "label": [0, 1, 0]})
    before = df.copy(deep=True)
    profile_dataset(df, "label")
    pd.testing.assert_frame_equal(df, before)


# ------------------------------------------------------------ Explainability


def test_explain_unsupported_model_degrades_gracefully():
    from ml_core.explainability import ExplainabilityUnavailable, global_feature_importance

    class _FakeEstimator:
        def predict(self, X):
            raise NotImplementedError

    class _FakePreprocessor:
        def transform(self, X):
            raise RuntimeError("cannot transform")

        def get_feature_names_out(self):
            return []

    from sklearn.pipeline import Pipeline

    pipeline = Pipeline(steps=[("preprocess", _FakePreprocessor()), ("model", _FakeEstimator())])
    X = pd.DataFrame({"a": [1, 2, 3]})

    with pytest.raises(ExplainabilityUnavailable):
        global_feature_importance(pipeline, X)


def test_explain_empty_input_is_rejected_cleanly():
    from ml_core.explainability import ExplainabilityUnavailable, global_feature_importance
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    pipeline = Pipeline(steps=[("preprocess", StandardScaler()), ("model", LogisticRegression())])
    with pytest.raises(ExplainabilityUnavailable):
        global_feature_importance(pipeline, pd.DataFrame())


def test_explain_endpoint_returns_unsupported_not_500_when_shap_missing(client, monkeypatch):
    import ml_core.explainability as explainability_module

    def _raise_unavailable(*args, **kwargs):
        raise explainability_module.ExplainabilityUnavailable("The shap package is not installed on this server.")

    monkeypatch.setattr(explainability_module, "global_feature_importance", _raise_unavailable)

    token = _register(client, "explain-missing@example.com")
    job_id = _train(client, token)
    resp = client.get(f"/api/v1/jobs/{job_id}/explain", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200  # not a 500
    assert resp.json()["supported"] is False


# ------------------------------------------------------------------- API


def test_job_detail_never_exposes_pickle_path(client):
    token = _register(client, "no-path-leak@example.com")
    job_id = _train(client, token)
    resp = client.get(f"/api/v1/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"})
    assert "pickle_path" not in resp.json()
    assert "MLForge_files" not in str(resp.json())
