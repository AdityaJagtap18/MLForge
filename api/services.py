"""Service layer: orchestrates ml_core + persistence so routers stay thin.

Mirrors the PRD's DatasetService/TrainingService/SearchService/PredictionService/
JobService split, kept in one module for this phase's actual scope rather than
one near-empty file per name.
"""
from __future__ import annotations

import hashlib
import logging
import os
import pickle
import uuid
from datetime import datetime, timezone
from io import BytesIO

import pandas as pd
from fastapi import UploadFile
from sqlalchemy.orm import Session

from api.db_models import Job
from api.integrations import mlflow_adapter
from ml_core import catalog
from ml_core.prediction import PredictionValidationError, predict as run_prediction
from ml_core.training import TrainingValidationError, train_one_model

logger = logging.getLogger("mlforge.services")

MAX_UPLOAD_BYTES = int(os.environ.get("MLFORGE_MAX_UPLOAD_BYTES", 50 * 1024 * 1024))  # 50MB
ALLOWED_EXTENSIONS = {".csv"}

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _files_dir() -> str:
    # Read at call time (not at import time) so tests can override
    # MLFORGE_FILES_DIR per-test via monkeypatch after this module is imported.
    return os.environ.get("MLFORGE_FILES_DIR", os.path.join(_REPO_ROOT, "MLForge_files"))


def _upload_dir() -> str:
    return os.path.join(_files_dir(), "api_uploads")


def _pickle_dir() -> str:
    return os.path.join(_files_dir(), "pickle_files")


def upload_path(dataset_filename: str) -> str:
    return os.path.join(_upload_dir(), dataset_filename)


class UploadValidationError(ValueError):
    pass


def read_uploaded_csv(file: UploadFile) -> tuple[pd.DataFrame, str, str]:
    """Validates and reads an uploaded CSV. Never trusts the client-supplied
    filename for path construction (NFR-SEC: untrusted-upload handling).
    Returns (dataframe, stored-filename, sha256 dataset fingerprint) -- the
    fingerprint is the dataset-lineage identifier referenced from Job and
    from MLflow run tags (docs/adr/0002)."""
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(f"Unsupported file type {ext!r}; only .csv is accepted.")

    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise UploadValidationError(f"File exceeds the {MAX_UPLOAD_BYTES} byte upload limit.")

    try:
        df = pd.read_csv(BytesIO(raw))
    except Exception as exc:  # pandas raises several distinct exception types
        raise UploadValidationError(f"Could not parse CSV file: {exc}") from exc

    if df.empty:
        raise UploadValidationError("Uploaded CSV has no rows.")

    fingerprint = hashlib.sha256(raw).hexdigest()

    safe_name = f"{uuid.uuid4()}.csv"
    upload_dir = _upload_dir()
    dest_path = os.path.join(upload_dir, safe_name)
    os.makedirs(upload_dir, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(raw)

    return df, safe_name, fingerprint


def owns(job: Job, current_user) -> bool:
    """SystemPrincipal (legacy API-key auth) bypasses ownership scoping, same
    as Phase 1 behavior; otherwise a job with no owner (created before user
    accounts existed) is nobody's, and any other user's job is off-limits."""
    if current_user.id == "system":
        return True
    return job.owner_id == current_user.id


def create_job(db: Session, **fields) -> Job:
    job = Job(**fields)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def finish_job(db: Session, job: Job, *, status: str, **fields) -> Job:
    job.status = status
    job.finished_at = datetime.now(timezone.utc)
    for key, value in fields.items():
        setattr(job, key, value)
    db.commit()
    db.refresh(job)
    return job


def save_pipeline(job_id: str, pipeline) -> str:
    pickle_dir = _pickle_dir()
    os.makedirs(pickle_dir, exist_ok=True)
    path = os.path.join(pickle_dir, f"{job_id}.pkl")
    with open(path, "wb") as f:
        pickle.dump(pipeline, f)
    return path


def load_pipeline(pickle_path: str):
    """Only ever called with a path read back from our own DB row — never
    from a user-supplied path (artifact trust boundary, see docs/security)."""
    with open(pickle_path, "rb") as f:
        return pickle.load(f)


def run_train_job(db: Session, job: Job, df: pd.DataFrame, model_params: dict) -> Job:
    with mlflow_adapter.tracked_run(f"train-{job.id}") as run:
        run.set_tags({**mlflow_adapter.run_context_tags(), "job_id": job.id, "dataset_fingerprint": job.dataset_fingerprint})
        run.log_params({"model_name": job.model_name, **model_params})

        try:
            result = train_one_model(
                df=df,
                input_cols=job.input_cols,
                target_col=job.target_col,
                model_name=job.model_name,
                model_params=model_params,
                task_type=job.task_type,
            )
        except (TrainingValidationError, catalog.UnknownModelError) as exc:
            return finish_job(
                db, job, status="failed", error_message=str(exc), mlflow_run_id=run.run_id, tracking_status=run.status
            )
        except Exception:
            # BUG-05 fix: never return raw tracebacks/stderr to API callers.
            logger.exception("Training job %s failed", job.id)
            return finish_job(
                db,
                job,
                status="failed",
                error_message="Training failed due to an internal error.",
                mlflow_run_id=run.run_id,
                tracking_status=run.status,
            )

        run.log_metrics(result.metrics)
        pickle_path = save_pipeline(job.id, result.pipeline)
        metrics_with_split_sizes = {**result.metrics, "n_train": result.n_train, "n_test": result.n_test}
        return finish_job(
            db,
            job,
            status="succeeded",
            task_type=result.task_type,
            metrics=metrics_with_split_sizes,
            pickle_path=pickle_path,
            mlflow_run_id=run.run_id,
            tracking_status=run.status,
        )


def run_find_best_job(db: Session, job: Job, df: pd.DataFrame, task_type: str) -> Job:
    allowed_models = catalog.get_allowed_models(task_type)
    results: list[dict] = []
    best_name: str | None = None
    best_pipeline = None
    best_metrics: dict | None = None
    best_score = None

    with mlflow_adapter.tracked_run(f"find-best-{job.id}") as parent_run:
        parent_run.set_tags(
            {**mlflow_adapter.run_context_tags(), "job_id": job.id, "dataset_fingerprint": job.dataset_fingerprint, "search": "true"}
        )

        for model_name in allowed_models:
            with mlflow_adapter.tracked_run(f"candidate-{model_name}", parent_run_id=parent_run.run_id) as candidate_run:
                candidate_run.log_params({"model_name": model_name})
                try:
                    result = train_one_model(
                        df=df,
                        input_cols=job.input_cols,
                        target_col=job.target_col,
                        model_name=model_name,
                        model_params={},
                        task_type=task_type,
                    )
                except Exception:
                    candidate_run.set_tags({"status": "failed"})
                    continue

                candidate_run.log_metrics(result.metrics)
                score = result.metrics.get("f1") if task_type == "classification" else result.metrics.get("r2")
                results.append({"model": model_name, **result.metrics})
                if score is not None and (best_score is None or score > best_score):
                    best_score, best_name, best_pipeline, best_metrics = score, model_name, result.pipeline, result.metrics

        if not results or best_name is None:
            return finish_job(
                db,
                job,
                status="failed",
                error_message="No candidate model trained successfully.",
                mlflow_run_id=parent_run.run_id,
                tracking_status=parent_run.status,
            )

        parent_run.log_metrics(best_metrics or {})
        parent_run.set_tags({"best_model": best_name})
        pickle_path = save_pipeline(job.id, best_pipeline)
        return finish_job(
            db,
            job,
            status="succeeded",
            task_type=task_type,
            model_name=best_name,
            metrics=best_metrics,
            results=results,
            pickle_path=pickle_path,
            mlflow_run_id=parent_run.run_id,
            tracking_status=parent_run.status,
        )


def run_predict_job(db: Session, source_job: Job, predict_job: Job, df: pd.DataFrame) -> tuple[Job, list]:
    try:
        pipeline = load_pipeline(source_job.pickle_path)
        predictions = run_prediction(pipeline, df, source_job.input_cols)
    except FileNotFoundError:
        return finish_job(db, predict_job, status="failed", error_message="Trained model artifact not found."), []
    except PredictionValidationError as exc:
        # User-input problem (e.g. missing column) -- safe to surface verbatim, no paths involved.
        return finish_job(db, predict_job, status="failed", error_message=str(exc)), []
    except Exception:
        # BUG-05-style fix: never return raw exception text (may contain
        # filesystem paths or other internals) to API callers.
        logger.exception("Prediction job %s failed", predict_job.id)
        return finish_job(db, predict_job, status="failed", error_message="Prediction failed due to an internal error."), []

    finish_job(db, predict_job, status="succeeded", metrics={"n_predictions": len(predictions)})
    return predict_job, predictions.tolist()
