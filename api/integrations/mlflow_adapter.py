"""MLflow adapter (docs/adr/0002). MLForge's database owns product
authorization/workflow state; MLflow owns experiment tracking and artifact
lineage. The browser never talks to MLflow directly -- only this adapter,
called from api/services.py, does.

Tracking URI defaults to a local file store under MLForge_files/ so this
works without a running MLflow server; set MLFLOW_TRACKING_URI to point at
a real server in Phase 2+ staging/production.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from contextlib import contextmanager
from typing import Iterator

logger = logging.getLogger("mlforge.mlflow")

_ENABLED = os.environ.get("MLFORGE_MLFLOW_ENABLED", "true").lower() not in ("0", "false", "no")


def _tracking_uri() -> str:
    files_dir = os.environ.get(
        "MLFORGE_FILES_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "MLForge_files"),
    )
    default_path = os.path.join(files_dir, "mlruns")
    return os.environ.get("MLFLOW_TRACKING_URI", f"file:{default_path}")


def _get_mlflow():
    try:
        import mlflow

        mlflow.set_tracking_uri(_tracking_uri())
        mlflow.set_experiment("mlforge")
        return mlflow
    except Exception as exc:  # mlflow not installed, or tracking backend unreachable
        logger.warning("MLflow unavailable, tracking skipped for this run: %s", exc)
        return None


@contextmanager
def tracked_run(run_name: str, parent_run_id: str | None = None) -> Iterator["RunHandle"]:
    """Yields a RunHandle. If MLflow is disabled/unavailable, yields a no-op
    handle so callers never need an `if mlflow_available` branch."""
    if not _ENABLED:
        yield RunHandle(mlflow=None, run_id=None)
        return

    mlflow = _get_mlflow()
    if mlflow is None:
        yield RunHandle(mlflow=None, run_id=None)
        return

    tags = {"mlflow.parentRunId": parent_run_id} if parent_run_id else None
    with mlflow.start_run(run_name=run_name, tags=tags, nested=bool(parent_run_id)) as run:
        yield RunHandle(mlflow=mlflow, run_id=run.info.run_id)


class RunHandle:
    def __init__(self, mlflow, run_id: str | None):
        self._mlflow = mlflow
        self.run_id = run_id

    def log_params(self, params: dict) -> None:
        if self._mlflow is None:
            return
        safe = {k: v for k, v in params.items() if v is not None}
        if safe:
            self._mlflow.log_params(safe)

    def log_metrics(self, metrics: dict) -> None:
        if self._mlflow is None:
            return
        numeric = {k: v for k, v in metrics.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
        if numeric:
            self._mlflow.log_metrics(numeric)

    def set_tags(self, tags: dict) -> None:
        if self._mlflow is None:
            return
        self._mlflow.set_tags({k: str(v) for k, v in tags.items() if v is not None})


def _git_commit() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return None


def run_context_tags() -> dict:
    """Standard tags every run gets: git commit, Python version (PRD MLOPS-EXP-01:
    log dataset fingerprint, config, seed, git commit, Python/dependency versions)."""
    return {
        "git_commit": _git_commit(),
        "python_version": sys.version.split()[0],
    }
