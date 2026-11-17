from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from api import services
from api.auth import require_auth_if_configured
from api.schemas import DatasetProfileResponse
from ml_core.dataset_profile import profile_dataset

router = APIRouter(prefix="/datasets", tags=["datasets"], dependencies=[Depends(require_auth_if_configured)])


@router.post("/profile", response_model=DatasetProfileResponse)
def profile(
    file: UploadFile = File(...),
    target_col: str | None = Form(None),
):
    """FR-DATA / transformation prompt "Dataset quality and validation":
    surfaces row/column counts, missingness, duplicates, constant columns,
    target distribution/imbalance and leakage heuristics before training --
    does not persist the upload as a job (call /train-model separately)."""
    try:
        df, _dataset_filename, _fingerprint = services.read_uploaded_csv(file)
    except services.UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if target_col and target_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"target_col {target_col!r} not found in uploaded CSV.")

    return profile_dataset(df, target_col)
