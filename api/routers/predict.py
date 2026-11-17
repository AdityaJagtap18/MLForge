from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api import services
from api.db import get_db
from api.db_models import Job
from api.deps import require_api_key
from api.schemas import PredictResponse

router = APIRouter(tags=["predict"], dependencies=[Depends(require_api_key)])


@router.post("/predict", response_model=PredictResponse)
def predict(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    job_id: str = Form(..., description="A completed train/find_best job_id whose model to use."),
):
    """Closes the FR-PREDICT gap: frontend/use-model.html previously had no
    backend at all. Loads the artifact path from our own DB row only — never
    from a client-supplied path (artifact trust boundary)."""
    source_job = db.get(Job, job_id)
    if source_job is None or source_job.job_type not in ("train", "find_best"):
        raise HTTPException(status_code=404, detail="No trained model found for that job_id.")
    if source_job.status != "succeeded" or not source_job.pickle_path:
        raise HTTPException(status_code=400, detail="That job did not complete successfully; no model to use.")

    try:
        df, dataset_filename = services.read_uploaded_csv(file)
    except services.UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    predict_job = services.create_job(
        db,
        job_type="predict",
        status="running",
        dataset_filename=dataset_filename,
        model_name=source_job.model_name,
        input_cols=source_job.input_cols,
        target_col=source_job.target_col,
        task_type=source_job.task_type,
    )
    predict_job, predictions = services.run_predict_job(db, source_job, predict_job, df)

    if predict_job.status == "failed":
        raise HTTPException(status_code=400, detail=predict_job.error_message)

    return PredictResponse(job_id=predict_job.id, predictions=predictions)
