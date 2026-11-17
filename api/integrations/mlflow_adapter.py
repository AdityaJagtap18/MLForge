"""MLflow adapter (docs/adr/0002). MLForge's database owns product
authorization/workflow state; MLflow owns experiment tracking and artifact
lineage. The browser never talks to MLflow directly -- only this adapter,
called from api/services.py, does.

Tracking URI defaults to a local file store under MLForge_files/ so this
works without a running MLflow server; set MLFLOW_TRACKING_URI to point at
a real server in Phase 2+ staging/production.

Reliability contract (hardening pass): a training/search job must never
fail because MLflow is unavailable or misbehaves. Every call into the
mlflow package -- import, set_tracking_uri, set_experiment, start_run, and
every log_params/log_metrics/set_tags call inside the run -- is individually
guarded. RunHandle.status tells the caller what actually happened
("ok" | "unavailable" | "error") so a job can honestly record
Job.tracking_status instead of silently claiming success either way.
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
    """Returns the configured mlflow module, or None if it can't be used for
    any reason (not installed, tracking URI unreachable, experiment creation
    failing, ...). Never raises."""
    try:
        import mlflow
    except ImportError as exc:
        logger.warning("mlflow is not installed -- tracking disabled for this run: %s", exc)
        return None

    try:
        mlflow.set_tracking_uri(_tracking_uri())
        mlflow.set_experiment("mlforge")
    except Exception as exc:
        logger.warning("MLflow tracking backend unavailable -- tracking disabled for this run: %s", exc)
        return None

    return mlflow


class RunHandle:
    """status is one of "ok" (actively tracking), "unavailable" (mlflow
    missing/unreachable -- expected in environments without it configured),
    or "error" (mlflow present but something failed starting/using the run
    -- logged at warning level so it's visible, distinct from "unavailable")."""

    def __init__(self, mlflow_module, run_id: str | None, status: str):
        self._mlflow = mlflow_module
        self.run_id = run_id
        self.status = status

    def log_params(self, params: dict) -> None:
        if self._mlflow is None:
            return
        safe = {k: v for k, v in params.items() if v is not None}
        if not safe:
            return
        try:
            self._mlflow.log_params(safe)
        except Exception as exc:
            logger.warning("MLflow log_params failed (run_id=%s): %s", self.run_id, exc)
            self.status = "error"

    def log_metrics(self, metrics: dict) -> None:
        if self._mlflow is None:
            return
        numeric = {k: v for k, v in metrics.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
        if not numeric:
            return
        try:
            self._mlflow.log_metrics(numeric)
        except Exception as exc:
            logger.warning("MLflow log_metrics failed (run_id=%s): %s", self.run_id, exc)
            self.status = "error"

    def set_tags(self, tags: dict) -> None:
        if self._mlflow is None:
            return
        try:
            self._mlflow.set_tags({k: str(v) for k, v in tags.items() if v is not None})
        except Exception as exc:
            logger.warning("MLflow set_tags failed (run_id=%s): %s", self.run_id, exc)
            self.status = "error"


_UNAVAILABLE = RunHandle(None, None, "unavailable")


@contextmanager
def tracked_run(run_name: str, parent_run_id: str | None = None) -> Iterator[RunHandle]:
    """Yields a RunHandle. Starting/ending the MLflow run is guarded so a
    tracking-backend failure degrades to an "unavailable"/"error" no-op
    handle instead of propagating -- but an exception raised by the
    caller's own code *inside* the `with` block (e.g. a real training
    failure) is never swallowed here; it propagates exactly as if this
    context manager weren't there. Those two failure modes must not be
    conflated, which is why this isn't a single try/except around a nested
    `with mlflow.start_run(...)`."""
    if not _ENABLED:
        yield RunHandle(None, None, "unavailable")
        return

    try:
        mlflow = _get_mlflow()
    except Exception as exc:
        # _get_mlflow() already guards its own internals and is documented to
        # return None rather than raise -- this is defense in depth for the
        # case where it (or a future edit to it) doesn't.
        logger.warning("MLflow initialization raised unexpectedly, tracking skipped: %s", exc)
        yield RunHandle(None, None, "error")
        return
    if mlflow is None:
        yield RunHandle(None, None, "unavailable")
        return

    tags = {"mlflow.parentRunId": parent_run_id} if parent_run_id else None
    try:
        run_ctx = mlflow.start_run(run_name=run_name, tags=tags, nested=bool(parent_run_id))
        run = run_ctx.__enter__()
    except Exception as exc:
        logger.warning("MLflow run %r could not be started, tracking skipped: %s", run_name, exc)
        yield RunHandle(None, None, "error")
        return

    handle = RunHandle(mlflow, run.info.run_id, "ok")
    try:
        yield handle
    except BaseException:
        run_ctx.__exit__(*sys.exc_info())
        raise
    else:
        try:
            run_ctx.__exit__(None, None, None)
        except Exception as exc:
            logger.warning("MLflow run %r did not close cleanly: %s", run_name, exc)
            handle.status = "error"


def run_context_tags() -> dict:
    """Standard tags every run gets: git commit, Python version (PRD MLOPS-EXP-01:
    log dataset fingerprint, config, seed, git commit, Python/dependency versions)."""
    return {
        "git_commit": _git_commit(),
        "python_version": sys.version.split()[0],
    }


def _git_commit() -> str | None:
    try:
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return (
            subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo_root, stderr=subprocess.DEVNULL)
            .decode()
            .strip()
        )
    except Exception:
        return None
