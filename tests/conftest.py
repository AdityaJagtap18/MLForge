from __future__ import annotations

import os
import tempfile

import pytest


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    """Every test gets its own MLForge_files dir and its own SQLite DB file,
    so tests never touch the real repo's data directory and never leak
    state between tests (catalog CSVs are the one exception, re-pointed to
    the real repo files below so the real catalog content is exercised)."""
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = tmp_path / "MLForge_files"
    (data_dir / "csv_configurations").mkdir(parents=True)

    import shutil

    for name in ("baml_model_tbl.csv", "model_capabilities.csv"):
        shutil.copy(
            os.path.join(repo_root, "MLForge_files", "csv_configurations", name),
            data_dir / "csv_configurations" / name,
        )

    monkeypatch.setenv("MLFORGE_FILES_DIR", str(data_dir))
    monkeypatch.setenv("MLFORGE_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.delenv("MLFORGE_API_KEY", raising=False)

    import ml_core.catalog as catalog_mod

    catalog_mod.MLFORGE_FILES_DIR = str(data_dir)
    catalog_mod.MODEL_CATALOG_CSV = str(data_dir / "csv_configurations" / "baml_model_tbl.csv")
    catalog_mod.MODEL_CAPABILITIES_CSV = str(data_dir / "csv_configurations" / "model_capabilities.csv")
    catalog_mod.clear_cache()

    yield data_dir


@pytest.fixture
def client(isolated_env):
    """TestClient wired to a fresh in-memory-backed SQLite DB per test, via
    FastAPI dependency override -- not via env vars, since api.db's engine is
    constructed once at import time."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from api.db import Base, get_db
    from api.main import app

    test_engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    from api import db_models  # noqa: F401 register models

    Base.metadata.create_all(bind=test_engine)

    def _override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
