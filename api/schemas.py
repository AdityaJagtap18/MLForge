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
    # Deliberately no pickle_path / filesystem path here -- internal
    # implementation detail, never part of a public API response. The
    # artifact is only ever loaded server-side via api/services.py using
    # the DB row directly (api/routers/explain.py, predict.py), never via a
    # path handed back to a client.
    input_cols: list | None = None
    target_col: str | None = None
    model_params: dict | None = None
    metrics: dict | None = None
    results: list | None = None
    mlflow_run_id: str | None = None
    tracking_status: str | None = None


class HealthResponse(BaseModel):
    status: str
    database: str
    model_catalog: str


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


class LogoutResponse(BaseModel):
    revoked: bool


class DatasetProfileResponse(BaseModel):
    n_rows: int
    n_columns: int
    columns: list[dict]
    duplicate_rows: int
    constant_columns: list[str]
    target_column: str | None = None
    target_distribution: dict | None = None
    class_imbalance_ratio: float | None = None
    leakage_warnings: list[str]


class ModelVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    model_name: str
    version: int
    lifecycle_state: str
    model_card: dict | None = None
    promoted_from: str | None = None
    created_at: datetime
    promoted_at: datetime | None = None


class PromoteRequest(BaseModel):
    target_state: str  # staging | production | archived


class ExplainResponse(BaseModel):
    job_id: str
    supported: bool
    message: str | None = None
    feature_names: list[str] | None = None
    global_importance: dict | None = None
