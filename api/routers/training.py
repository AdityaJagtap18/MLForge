from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api import services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.schemas import FindBestModelResponse, TrainModelResponse
from ml_core.task_detection import detect_task_type

router = APIRouter(tags=["training"])


def _owner_id(current_user) -> str | None:
    # SystemPrincipal (legacy API-key bypass) owns nothing -- stay NULL in
    # the DB, not the literal string "system", so registry_service's
    # job.owner_id == owner_id checks (and anything else comparing against
    # a real user id) stay consistent with how every other router computes
    # this (deployments.py, registry.py, retraining.py).
    return None if current_user.id == "system" else current_user.id


@router.post("/train-model", response_model=TrainModelResponse)
def train_model(
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    file: UploadFile = File(...),
    model_name: str = Form(...),
    input_cols: str = Form(...),
    target_col: str = Form(...),
    model_params: str = Form("{}"),
):
    try:
        df, dataset_filename, fingerprint = services.read_uploaded_csv(file)
    except services.UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        params = json.loads(model_params)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"model_params is not valid JSON: {exc}") from exc

    input_cols_list = [c.strip() for c in input_cols.split(",") if c.strip()]

    job = services.create_job(
        db,
        job_type="train",
        status="running",
        owner_id=_owner_id(current_user),
        dataset_filename=dataset_filename,
        dataset_fingerprint=fingerprint,
        model_name=model_name,
        input_cols=input_cols_list,
        target_col=target_col,
        model_params=params,
    )
    job = services.run_train_job(db, job, df, params)

    if job.status == "failed":
        raise HTTPException(status_code=400, detail=job.error_message)

    return TrainModelResponse(
        job_id=job.id,
        model_name=job.model_name,
        task_type=job.task_type,
        metrics=job.metrics,
        n_train=(job.metrics or {}).get("n_train", 0),
        n_test=(job.metrics or {}).get("n_test", 0),
    )


@router.post("/find-best-model", response_model=FindBestModelResponse)
def find_best_model(
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    file: UploadFile = File(...),
    input_cols: str = Form(...),
    target_col: str = Form(...),
    task_type: str | None = Form(None),
):
    try:
        df, dataset_filename, fingerprint = services.read_uploaded_csv(file)
    except services.UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    input_cols_list = [c.strip() for c in input_cols.split(",") if c.strip()]
    if target_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"target_col {target_col!r} not found in uploaded CSV.")

    resolved_task_type = task_type or detect_task_type(df[target_col])
    if resolved_task_type not in ("classification", "regression"):
        raise HTTPException(status_code=400, detail="task_type must be 'classification' or 'regression'.")

    job = services.create_job(
        db,
        job_type="find_best",
        status="running",
        owner_id=_owner_id(current_user),
        dataset_filename=dataset_filename,
        dataset_fingerprint=fingerprint,
        input_cols=input_cols_list,
        target_col=target_col,
        task_type=resolved_task_type,
    )
    job = services.run_find_best_job(db, job, df, resolved_task_type)

    if job.status == "failed":
        raise HTTPException(status_code=400, detail=job.error_message)

    return FindBestModelResponse(
        job_id=job.id,
        task_type=job.task_type,
        best_model=job.model_name,
        results=job.results or [],
    )
