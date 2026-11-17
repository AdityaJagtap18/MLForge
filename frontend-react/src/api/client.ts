/**
 * Single typed API client (transformation prompt requirement: one client,
 * centralized error handling). Every call goes through here instead of
 * `fetch` scattered across pages, and the base URL is read from
 * VITE_API_BASE_URL instead of being hardcoded (fixes the old frontend's
 * hardcoded `http://127.0.0.1:8000` in every JS file).
 */
import type {
  FindBestModelResponse,
  HealthResponse,
  JobSummary,
  ModelsResponse,
  ModelVersion,
  PredictResponse,
  RetrainingAudit,
  RetrainingCandidate,
  TrainModelResponse,
} from "./types";
import { ApiError } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/api/v1/health"),

  listModels: () => request<ModelsResponse>("/api/v1/models"),

  trainModel: (form: FormData) =>
    request<TrainModelResponse>("/api/v1/train-model", { method: "POST", body: form }),

  findBestModel: (form: FormData) =>
    request<FindBestModelResponse>("/api/v1/find-best-model", { method: "POST", body: form }),

  predict: (form: FormData) => request<PredictResponse>("/api/v1/predict", { method: "POST", body: form }),

  listJobs: (jobType?: string) =>
    request<JobSummary[]>(`/api/v1/jobs${jobType ? `?job_type=${jobType}` : ""}`),

  listRegistryVersions: () => request<ModelVersion[]>("/api/v1/registry"),

  triggerRetraining: (modelVersionId: string) =>
    request<RetrainingCandidate>("/api/v1/retraining/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_version_id: modelVersionId }),
    }),

  listRetrainingCandidates: () => request<RetrainingCandidate[]>("/api/v1/retraining"),

  evaluateCandidate: (id: string) => request<RetrainingCandidate>(`/api/v1/retraining/${id}/evaluate`, { method: "POST" }),

  approveCandidate: (id: string, reason?: string) =>
    request<RetrainingCandidate>(`/api/v1/retraining/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? null }),
    }),

  rejectCandidate: (id: string, reason?: string) =>
    request<RetrainingCandidate>(`/api/v1/retraining/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? null }),
    }),

  getCandidateAudit: (id: string) => request<RetrainingAudit>(`/api/v1/retraining/${id}/audit`),
};
