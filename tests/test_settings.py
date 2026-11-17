from __future__ import annotations

import pytest
from api.main import app


def _register(client, email: str, password: str = "password123") -> tuple[str, str]:
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], data["user_id"]


def test_settings_development_bypass_mode(client):
    """In development mode without token, settings returns system/local-dev profile
    and complete configuration without failing."""
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    data = resp.json()

    # Config
    assert data["config"]["app_name"] == "MLForge MLOps Platform"
    assert data["config"]["app_version"] == "0.4.0"
    assert data["config"]["api_version"] == "v1"
    assert "backend_base_url" in data["config"]
    assert "frontend_url" in data["config"]

    # Profile (dev bypass or system)
    assert data["profile"]["user_id"]
    assert data["profile"]["role"]

    # Capabilities
    assert len(data["capabilities"]) >= 8
    keys = {c["key"] for c in data["capabilities"]}
    assert "model_training" in keys
    assert "model_registry" in keys
    assert "model_deployments" in keys

    # Health probes
    assert len(data["health"]) == 5
    health_keys = {h["key"] for h in data["health"]}
    assert health_keys == {"fastapi", "database", "catalog", "mlflow", "evidently"}


def test_settings_authenticated_profile_and_session(client):
    """Authenticated user receives their own user_id, email, and session timestamps."""
    token, user_id = _register(client, "settings-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/v1/settings", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["profile"]["user_id"] == user_id
    assert data["profile"]["email"] == "settings-user@example.com"
    assert data["profile"]["auth_status"] == "authenticated"
    assert data["profile"]["role"] == "ML Engineer"
    assert data["profile"]["is_service_account"] is False
    assert data["profile"]["session_created_at"] is not None
    assert data["profile"]["session_expires_at"] is not None


def test_settings_profile_direct_endpoint(client):
    """GET /api/v1/settings/profile returns user session details."""
    token, user_id = _register(client, "settings-direct@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/v1/settings/profile", headers=headers)
    assert resp.status_code == 200
    profile = resp.json()

    assert profile["user_id"] == user_id
    assert profile["email"] == "settings-direct@example.com"
    assert profile["auth_status"] == "authenticated"


def test_settings_independent_health_endpoint(client):
    """GET /api/v1/settings/health returns independent diagnostic status and latency."""
    resp = client.get("/api/v1/settings/health")
    assert resp.status_code == 200
    probes = resp.json()

    assert len(probes) == 5
    for probe in probes:
        assert probe["name"]
        assert probe["key"] in ("fastapi", "database", "catalog", "mlflow", "evidently")
        assert probe["status"] in ("healthy", "degraded", "unavailable", "not_configured")
        assert probe["message"]
        assert "latency_ms" in probe
        assert probe["last_checked"]


def test_settings_strict_secret_and_credential_redaction(client):
    """Verifies that no API keys, password hashes, or raw database connection strings
    leak into settings or health responses."""
    token, _ = _register(client, "redaction-test@example.com")
    resp = client.get("/api/v1/settings", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    text_data = resp.text

    # Must NOT expose password hashes
    assert "password_hash" not in text_data
    assert "pbkdf2" not in text_data

    # Must NOT expose raw tokens
    assert token not in text_data

    # Must NOT expose raw database URLs with credentials
    assert "sqlite:///" not in text_data
    assert "postgresql://" not in text_data
    assert "password@" not in text_data


def test_settings_logout_invalidates_session(client):
    """POST /api/v1/auth/logout revokes the active token and blocks further use."""
    token, _ = _register(client, "logout-test@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Verify token works
    resp1 = client.get("/api/v1/settings/profile", headers=headers)
    assert resp1.status_code == 200

    # Execute logout
    logout_resp = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 200
    assert logout_resp.json()["revoked"] is True

    # Duplicate logout returns revoked=False (idempotent / already revoked)
    dup_resp = client.post("/api/v1/auth/logout", headers=headers)
    assert dup_resp.status_code == 200
    assert dup_resp.json()["revoked"] is False

    # Attempting to use the revoked token must fail with 401
    resp2 = client.get("/api/v1/settings/profile", headers=headers)
    assert resp2.status_code == 401
    assert "revoked" in resp2.json()["detail"].lower()
