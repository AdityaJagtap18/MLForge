from __future__ import annotations

import os

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api import services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Job
from api.schemas import ExplainResponse
from ml_core.explainability import ExplainabilityUnavailable, global_feature_importance

router = APIRouter(tags=["explainability"], dependencies=[Depends(require_auth_if_configured)])


@router.get("/jobs/{job_id}/explain", response_model=ExplainResponse)
def explain(job_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Global feature importance for a completed job's model. Explicitly a
    *contribution* summary, not a causal claim -- see ExplainResponse.message."""
    job = db.get(Job, job_id)
    if job is None or not services.owns(job, current_user):
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "succeeded" or not job.pickle_path:
        raise HTTPException(status_code=400, detail="Job did not complete successfully; nothing to explain.")

    dataset_path = services.upload_path(job.dataset_filename or "")
    if not job.dataset_filename or not os.path.exists(dataset_path):
        return ExplainResponse(job_id=job_id, supported=False, message="Original training dataset is no longer available.")

    try:
        pipeline = services.load_pipeline(job.pickle_path)
        df = pd.read_csv(dataset_path)
        importance = global_feature_importance(pipeline, df[job.input_cols])
    except ExplainabilityUnavailable as exc:
        return ExplainResponse(job_id=job_id, supported=False, message=exc.message)
    except Exception as exc:
        return ExplainResponse(job_id=job_id, supported=False, message=f"Could not compute explanation: {exc}"[:500])

    return ExplainResponse(
        job_id=job_id,
        supported=True,
        message=(
            "Values are mean(|SHAP value|) per feature: how much each feature contributed "
            "to this model's predictions on a sample of the training data. This reflects "
            "the model's learned behavior, not a causal relationship in the real world."
        ),
        feature_names=list(importance.keys()),
        global_importance=importance,
    )
