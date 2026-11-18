export type TaskType = "classification" | "regression";

export interface ModelsResponse {
  models: string[];
}

export interface TrainModelResponse {
  status: "success";
  job_id: string;
  model_name: string;
  task_type: TaskType;
  metrics: Record<string, unknown>;
  n_train: number;
  n_test: number;
}

export interface FindBestModelResponse {
  status: "success";
  job_id: string;
  task_type: TaskType;
  best_model: string;
  results: Record<string, unknown>[];
}

export interface PredictResponse {
  status: "success";
  job_id: string;
  predictions: (number | string)[];
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  missing_count: number;
  missing_pct: number;
  n_unique: number;
  is_constant: boolean;
}

export interface ContinuousDistribution {
  min: number;
  max: number;
  mean: number;
  std: number;
}

export interface DatasetProfileResponse {
  n_rows: number;
  n_columns: number;
  columns: ColumnProfile[];
  duplicate_rows: number;
  constant_columns: string[];
  target_column: string | null;
  target_distribution: Record<string, number> | ContinuousDistribution | null;
  class_imbalance_ratio: number | null;
  leakage_warnings: string[];
}

export interface JobSummary {
  id: string;
  job_type: "train" | "find_best" | "predict";
  status: "pending" | "running" | "succeeded" | "failed";
  model_name: string | null;
  task_type: TaskType | null;
  dataset_filename: string | null;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface JobDetail extends JobSummary {
  input_cols: string[] | null;
  target_col: string | null;
  model_params: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  results: Record<string, unknown>[] | null;
  mlflow_run_id: string | null;
  tracking_status: string | null;
}

export interface DeploymentResponse {
  id: string;
  model_version_id: string;
  model_name: string;
  status: "active" | "replaced" | "stopped";
  replaced_by: string | null;
  created_at: string;
  stopped_at: string | null;
}

export interface DeploymentMetricsResponse extends DeploymentResponse {
  request_count: number;
  error_count: number;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
}

export interface PredictJSONRequest {
  features: Record<string, unknown>;
}

export interface PredictJSONResponse {
  status: string;
  deployment_id: string;
  model_version: number;
  prediction: unknown;
  latency_ms: number;
}

export interface MonitoringSnapshotResponse {
  id: string;
  deployment_id: string;
  drift_type: string;
  n_rows: number;
  drift_detected: boolean | null;
  drift_share: number | null;
  status: "ok" | "unavailable" | "error";
  error_message: string | null;
  created_at: string;
  alert: boolean;
  report?: Record<string, any> | null;
}

export interface HealthResponse {
  status: string;
  database: string;
  model_catalog: string;
}

export interface ModelsOverview {
  total_registered: number;
  by_stage: {
    development: number;
    staging: number;
    production: number;
    archived: number;
  };
  production_champion: string | null;
}

export interface ExperimentsOverview {
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  unique_datasets: number;
}

export interface DeploymentsOverview {
  total: number;
  active: number;
  stopped: number;
  replaced: number;
}

export interface DriftAlertItem {
  snapshot_id: string;
  deployment_id: string;
  model_name: string;
  drift_share: number | null;
  drift_detected: boolean | null;
  created_at: string;
  is_active: boolean;
  status: "active" | "resolved";
  resolution_reason: string | null;
}

export interface DriftAlertsOverview {
  total: number;
  active: number;
  resolved: number;
  recent_alerts: DriftAlertItem[];
}

export interface DailyActivityPoint {
  date: string;
  count: number;
}

export interface ModelPerformancePoint {
  model_name: string;
  version: number | null;
  stage: string | null;
  metric_name: string;
  metric_value: number;
}

export interface SystemHealthOverview {
  api: string;
  database: string;
  model_catalog: string;
  mlflow: string;
  monitoring: string;
}

export interface OverviewStatsResponse {
  models: ModelsOverview;
  experiments: ExperimentsOverview;
  deployments: DeploymentsOverview;
  drift_alerts: DriftAlertsOverview;
  training_activity: DailyActivityPoint[];
  model_performance: ModelPerformancePoint[];
  system_health: SystemHealthOverview;
  recent_jobs: JobSummary[];
}

export interface ModelVersion {
  id: string;
  job_id: string;
  model_name: string;
  version: number;
  lifecycle_state: "development" | "staging" | "production" | "archived";
  model_card: Record<string, any> | null;
  promoted_from: string | null;
  created_at: string;
  promoted_at: string | null;
}

export interface ChampionChallengerResponse {
  model_name: string;
  champion: ModelVersion | null;
  challenger: ModelVersion;
  champion_metrics: Record<string, any> | null;
  challenger_metrics: Record<string, any>;
  recommendation: string;
}

export interface ExplainResponse {
  job_id: string;
  supported: boolean;
  message: string | null;
  feature_names: string[] | null;
  global_importance: Record<string, number> | null;
}

export type RetrainingSource = "manual" | "drift";
export type RetrainingStatus = "pending" | "evaluated" | "rejected" | "approved" | "promotion_failed";

export interface RetrainingEvaluation {
  candidate_score: number | null;
  champion_score: number | null;
  champion_version_id: string | null;
  gate_threshold: number;
  passed: boolean;
  reason: string;
}

export interface RetrainingCandidate {
  id: string;
  model_name: string;
  source: RetrainingSource;
  reason: string | null;
  job_id: string;
  monitoring_snapshot_id: string | null;
  status: RetrainingStatus;
  evaluated_champion_version_id: string | null;
  evaluation: RetrainingEvaluation | null;
  evaluated_at: string | null;
  decision: "approved" | "rejected" | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  promoted_version_id: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface RetrainingAudit {
  candidate_id: string;
  source: RetrainingSource;
  reason: string | null;
  monitoring_snapshot: { id: string; drift_type: string; drift_detected: boolean | null; drift_share: number | null; created_at: string } | null;
  training_job: { id: string; status: string; metrics: Record<string, unknown> | null; model_name: string } | null;
  evaluation: RetrainingEvaluation | null;
  evaluated_champion_version_id: string | null;
  decision: { decision: string | null; reason: string | null; decided_by: string | null; decided_at: string | null };
  promoted_version: { id: string; version: number; lifecycle_state: string } | null;
  status: RetrainingStatus;
  created_at: string;
  triggered_by: string | null;
}

// Phase 5B.7: Settings & Environment Status Interfaces
export interface AppConfigInfo {
  app_name: string;
  app_version: string;
  environment: string;
  is_production: boolean;
  api_version: string;
  backend_base_url: string;
  frontend_url: string;
  deployment_mode: string;
  startup_time: string;
  docs_url: string;
}

export interface CapabilityItem {
  name: string;
  key: string;
  category: string;
  status: "available" | "enabled" | "unavailable" | "degraded" | "disabled";
  description: string;
  dependency: string | null;
}

export interface UserProfileInfo {
  user_id: string;
  email: string | null;
  role: string;
  auth_status: string;
  session_created_at: string | null;
  session_expires_at: string | null;
  is_service_account: boolean;
}

export interface DependencyHealthDetail {
  name: string;
  key: string;
  status: "healthy" | "degraded" | "unavailable" | "not_configured" | "unknown";
  latency_ms: number | null;
  last_checked: string;
  message: string;
  version: string | null;
}

export interface SettingsResponse {
  config: AppConfigInfo;
  capabilities: CapabilityItem[];
  health: DependencyHealthDetail[];
  profile: UserProfileInfo;
}

export interface LogoutResponse {
  revoked: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
