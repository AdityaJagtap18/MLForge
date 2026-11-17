from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MLForgeBaseModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class ErrorResponse(MLForgeBaseModel):
    status: str = "error"
    message: str


class ModelsResponse(MLForgeBaseModel):
    models: list[str]


class TrainModelResponse(MLForgeBaseModel):
    status: str = "success"
    job_id: str
    model_name: str
    task_type: str
    metrics: dict
    n_train: int
    n_test: int


class FindBestModelResponse(MLForgeBaseModel):
    status: str = "success"
    job_id: str
    task_type: str
    best_model: str
    results: list[dict]


class PredictResponse(MLForgeBaseModel):
    status: str = "success"
    job_id: str
    predictions: list


class JobSummary(MLForgeBaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

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


class HealthResponse(MLForgeBaseModel):
    status: str
    database: str
    model_catalog: str


class RegisterRequest(MLForgeBaseModel):
    email: str
    password: str


class LoginRequest(MLForgeBaseModel):
    email: str
    password: str


class TokenResponse(MLForgeBaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


class LogoutResponse(MLForgeBaseModel):
    revoked: bool


class DatasetProfileResponse(MLForgeBaseModel):
    n_rows: int
    n_columns: int
    columns: list[dict]
    duplicate_rows: int
    constant_columns: list[str]
    target_column: str | None = None
    target_distribution: dict | None = None
    class_imbalance_ratio: float | None = None
    leakage_warnings: list[str]


class ModelVersionResponse(MLForgeBaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    job_id: str
    model_name: str
    version: int
    lifecycle_state: str
    model_card: dict | None = None
    promoted_from: str | None = None
    created_at: datetime
    promoted_at: datetime | None = None


class PromoteRequest(MLForgeBaseModel):
    target_state: str  # staging | production | archived


class ExplainResponse(MLForgeBaseModel):
    job_id: str
    supported: bool
    message: str | None = None
    feature_names: list[str] | None = None
    global_importance: dict | None = None


class DeploymentResponse(MLForgeBaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    model_version_id: str
    model_name: str
    status: str
    replaced_by: str | None = None
    created_at: datetime
    stopped_at: datetime | None = None


class DeploymentMetricsResponse(DeploymentResponse):
    request_count: int
    error_count: int
    avg_latency_ms: float | None = None
    max_latency_ms: float | None = None


class PredictJSONRequest(MLForgeBaseModel):
    features: dict


class PredictJSONResponse(MLForgeBaseModel):
    status: str = "success"
    deployment_id: str
    model_version: int
    prediction: object
    latency_ms: float


class MonitoringSnapshotResponse(MLForgeBaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    deployment_id: str
    drift_type: str
    n_rows: int
    drift_detected: bool | None = None
    drift_share: float | None = None
    status: str
    error_message: str | None = None
    created_at: datetime
    alert: bool = False


class ChampionChallengerResponse(MLForgeBaseModel):
    model_name: str
    champion: ModelVersionResponse | None = None
    challenger: ModelVersionResponse
    champion_metrics: dict | None = None
    challenger_metrics: dict
    recommendation: str


class RetrainingCandidateResponse(MLForgeBaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: str
    model_name: str
    source: str  # manual | drift
    reason: str | None = None
    job_id: str
    monitoring_snapshot_id: str | None = None
    status: str  # pending | evaluated | rejected | approved | promotion_failed
    evaluated_champion_version_id: str | None = None
    evaluation: dict | None = None
    evaluated_at: datetime | None = None
    decision: str | None = None
    decision_reason: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    promoted_version_id: str | None = None
    triggered_by: str | None = None
    created_at: datetime


class RetrainingDecisionRequest(MLForgeBaseModel):
    reason: str | None = None


class GenerateCandidateRequest(MLForgeBaseModel):
    model_version_id: str  # the registered version whose config to retrain with
