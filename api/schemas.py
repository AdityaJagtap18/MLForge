from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ErrorResponse(BaseModel):
    status: str = "error"
    message: str


class ModelsResponse(BaseModel):
    models: list[str]


class TrainModelResponse(BaseModel):
    status: str = "success"
    job_id: str
    model_name: str
    task_type: str
    metrics: dict
    n_train: int
    n_test: int


class FindBestModelResponse(BaseModel):
    status: str = "success"
    job_id: str
    task_type: str
    best_model: str
    results: list[dict]


class PredictResponse(BaseModel):
    status: str = "success"
    job_id: str
    predictions: list


class JobSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_type: str
    status: str
    model_name: str | None = None
    task_type: str | None = None
    dataset_filename: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None


class JobDetail(JobSummary):
    input_cols: list | None = None
    target_col: str | None = None
    model_params: dict | None = None
    metrics: dict | None = None
    results: list | None = None
    pickle_path: str | None = None


class HealthResponse(BaseModel):
    status: str
    database: str
    model_catalog: str
