from __future__ import annotations

import os
import time

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api import deployment_service, monitoring_service, services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Deployment, Job, ModelVersion
from api.schemas import (
    DeploymentMetricsResponse,
    DeploymentResponse,
    MonitoringSnapshotResponse,
    PredictJSONRequest,
    PredictJSONResponse,
)

router = APIRouter(prefix="/deployments", tags=["deployments"], dependencies=[Depends(require_auth_if_configured)])


def _owner_id(current_user) -> str | None:
    return None if current_user.id == "system" else current_user.id


def _get_owned_version(db: Session, version_id: str, current_user) -> ModelVersion:
    version = db.get(ModelVersion, version_id)
    if version is None or (current_user.id != "system" and version.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Model version not found.")
    return version


def _get_owned_deployment(db: Session, deployment_id: str, current_user) -> Deployment:
    deployment = db.get(Deployment, deployment_id)
    if deployment is None or (current_user.id != "system" and deployment.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Deployment not found.")
    return deployment


@router.post("/{version_id}/deploy", response_model=DeploymentResponse)
def deploy(version_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    version = _get_owned_version(db, version_id, current_user)
    try:
        return deployment_service.deploy(db, version, _owner_id(current_user))
    except deployment_service.DeploymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("", response_model=list[DeploymentResponse])
def list_deployments(db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    return deployment_service.list_deployments(db, _owner_id(current_user))


@router.get("/{deployment_id}", response_model=DeploymentMetricsResponse)
def get_deployment(deployment_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    deployment = _get_owned_deployment(db, deployment_id, current_user)
    metrics = deployment_service.deployment_metrics(db, deployment_id)
    return DeploymentMetricsResponse(**DeploymentResponse.model_validate(deployment).model_dump(), **metrics)


@router.post("/{deployment_id}/rollback", response_model=DeploymentResponse)
def rollback(deployment_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    deployment = _get_owned_deployment(db, deployment_id, current_user)
    try:
        return deployment_service.rollback(db, deployment)
    except deployment_service.DeploymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{deployment_id}/stop", response_model=DeploymentResponse)
def stop(deployment_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    deployment = _get_owned_deployment(db, deployment_id, current_user)
    try:
        return deployment_service.stop(db, deployment)
    except deployment_service.DeploymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{deployment_id}/predict", response_model=PredictJSONResponse)
def predict_json(
    deployment_id: str, body: PredictJSONRequest, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)
):
    """Real-time single-record JSON inference against a deployed model
    (transformation prompt "controlled real-time JSON prediction API"),
    distinct from /predict (job-scoped, CSV, closes the original
    use-model.html gap). Every call is logged for the deployment's
    request/latency/error metrics regardless of outcome."""
    deployment = _get_owned_deployment(db, deployment_id, current_user)
    if deployment.status != "active":
        raise HTTPException(status_code=400, detail="This deployment is not active.")

    version = db.get(ModelVersion, deployment.model_version_id)
    job = db.get(Job, version.job_id) if version else None
    if version is None or job is None or job.status != "succeeded" or not job.pickle_path:
        raise HTTPException(status_code=400, detail="Deployed model artifact is unavailable.")

    missing = [c for c in job.input_cols if c not in body.features]
    start = time.perf_counter()
    if missing:
        deployment_service.log_request(db, deployment_id, success=False, latency_ms=(time.perf_counter() - start) * 1000, error_message="missing input fields")
        raise HTTPException(status_code=400, detail=f"Missing required input field(s): {missing}")

    try:
        pipeline = services.load_pipeline(job.pickle_path)
        row = pd.DataFrame([{c: body.features[c] for c in job.input_cols}])
        prediction = pipeline.predict(row)[0]
        if hasattr(prediction, "item"):
            prediction = prediction.item()
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        deployment_service.log_request(db, deployment_id, success=False, latency_ms=latency_ms, error_message="inference failed")
        raise HTTPException(status_code=400, detail="Prediction failed due to an internal error.")

    latency_ms = (time.perf_counter() - start) * 1000
    deployment_service.log_request(db, deployment_id, success=True, latency_ms=latency_ms)

    return PredictJSONResponse(deployment_id=deployment_id, model_version=version.version, prediction=prediction, latency_ms=round(latency_ms, 3))


@router.post("/{deployment_id}/monitor", response_model=MonitoringSnapshotResponse)
def monitor(
    deployment_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    file: UploadFile = File(...),
):
    """Evaluates data drift between the deployed model's original training
    data and a new uploaded window (transformation prompt "Monitor input
    data quality and feature drift")."""
    deployment = _get_owned_deployment(db, deployment_id, current_user)
    version = db.get(ModelVersion, deployment.model_version_id)
    job = db.get(Job, version.job_id) if version else None
    if job is None or not job.dataset_filename:
        raise HTTPException(status_code=400, detail="Original training dataset for this deployment is unavailable.")

    reference_path = services.upload_path(job.dataset_filename)
    if not os.path.exists(reference_path):
        raise HTTPException(status_code=400, detail="Original training dataset for this deployment is unavailable.")
    reference_df = pd.read_csv(reference_path)

    try:
        current_df, _filename, _fingerprint = services.read_uploaded_csv(file)
    except services.UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    missing = [c for c in job.input_cols if c not in current_df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Uploaded window is missing column(s) required by this model: {missing}")

    snapshot = monitoring_service.evaluate_data_drift(db, deployment_id, reference_df, current_df, job.input_cols)
    response = MonitoringSnapshotResponse.model_validate(snapshot)
    response.alert = monitoring_service.is_alertable(snapshot)
    return response


@router.get("/{deployment_id}/monitoring", response_model=list[MonitoringSnapshotResponse])
def list_monitoring(deployment_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    _get_owned_deployment(db, deployment_id, current_user)  # ownership check, result unused
    snapshots = monitoring_service.list_snapshots(db, deployment_id)
    results = []
    for snap in snapshots:
        r = MonitoringSnapshotResponse.model_validate(snap)
        r.alert = monitoring_service.is_alertable(snap)
        results.append(r)
    return results
