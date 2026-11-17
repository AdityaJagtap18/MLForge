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

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
