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

export interface HealthResponse {
  status: string;
  database: string;
  model_catalog: string;
}

export interface ModelVersion {
  id: string;
  job_id: string;
  model_name: string;
  version: number;
  lifecycle_state: "development" | "staging" | "production" | "archived";
  model_card: Record<string, unknown> | null;
  promoted_from: string | null;
  created_at: string;
  promoted_at: string | null;
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

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
