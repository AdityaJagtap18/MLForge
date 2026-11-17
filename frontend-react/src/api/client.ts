/**
 * Single typed API client (transformation prompt requirement: one client,
 * centralized error handling). Every call goes through here instead of
 * `fetch` scattered across pages, and the base URL is read from
 * VITE_API_BASE_URL instead of being hardcoded (fixes the old frontend's
 * hardcoded `http://127.0.0.1:8000` in every JS file).
 */
import type {
  ChampionChallengerResponse,
  DatasetProfileResponse,
  DependencyHealthDetail,
  DeploymentMetricsResponse,
  DeploymentResponse,
  ExplainResponse,
  FindBestModelResponse,
  HealthResponse,
  JobDetail,
  JobSummary,
  LogoutResponse,
  ModelsResponse,
  ModelVersion,
  MonitoringSnapshotResponse,
  OverviewStatsResponse,
  PredictJSONResponse,
  PredictResponse,
  RetrainingAudit,
  RetrainingCandidate,
  SettingsResponse,
  TrainModelResponse,
  UserProfileInfo,
} from "./types";
import { ApiError } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  const token = localStorage.getItem("mlforge_token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

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

  getOverviewStats: () => request<OverviewStatsResponse>("/api/v1/overview"),

  listModels: () => request<ModelsResponse>("/api/v1/models"),

  trainModel: (form: FormData) =>
    request<TrainModelResponse>("/api/v1/train-model", { method: "POST", body: form }),

  findBestModel: (form: FormData) =>
    request<FindBestModelResponse>("/api/v1/find-best-model", { method: "POST", body: form }),

  predict: (form: FormData) => request<PredictResponse>("/api/v1/predict", { method: "POST", body: form }),

  listJobs: (jobType?: string) =>
    request<JobSummary[]>(`/api/v1/jobs${jobType ? `?job_type=${jobType}` : ""}`),

  getJob: (jobId: string) => request<JobDetail>(`/api/v1/jobs/${jobId}`),

  explainJob: (jobId: string) => request<ExplainResponse>(`/api/v1/jobs/${jobId}/explain`),

  profileDataset: (form: FormData) =>
    request<DatasetProfileResponse>("/api/v1/datasets/profile", { method: "POST", body: form }),

  registerModel: (jobId: string) =>
    request<ModelVersion>(`/api/v1/registry/${jobId}/register`, { method: "POST" }),

  listRegistryVersions: () => request<ModelVersion[]>("/api/v1/registry"),

  promoteModelVersion: (versionId: string, targetState: "development" | "staging" | "production" | "archived") =>
    request<ModelVersion>(`/api/v1/registry/${versionId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_state: targetState }),
    }),

  rollbackModelVersion: (versionId: string) =>
    request<ModelVersion>(`/api/v1/registry/${versionId}/rollback`, { method: "POST" }),

  compareChampionChallenger: (challengerVersionId: string) =>
    request<ChampionChallengerResponse>(`/api/v1/registry/compare?challenger_version_id=${challengerVersionId}`),

  listDeployments: () => request<DeploymentResponse[]>("/api/v1/deployments"),

  getDeployment: (deploymentId: string) =>
    request<DeploymentMetricsResponse>(`/api/v1/deployments/${deploymentId}`),

  deployModel: (versionId: string) =>
    request<DeploymentResponse>(`/api/v1/deployments/${versionId}/deploy`, { method: "POST" }),

  stopDeployment: (deploymentId: string) =>
    request<DeploymentResponse>(`/api/v1/deployments/${deploymentId}/stop`, { method: "POST" }),

  rollbackDeployment: (deploymentId: string) =>
    request<DeploymentResponse>(`/api/v1/deployments/${deploymentId}/rollback`, { method: "POST" }),

  predictJSON: (deploymentId: string, features: Record<string, unknown>) =>
    request<PredictJSONResponse>(`/api/v1/deployments/${deploymentId}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),

  listMonitoringSnapshots: (deploymentId: string) =>
    request<MonitoringSnapshotResponse[]>(`/api/v1/deployments/${deploymentId}/monitoring`),

  runMonitoring: (deploymentId: string, form: FormData) =>
    request<MonitoringSnapshotResponse>(`/api/v1/deployments/${deploymentId}/monitor`, {
      method: "POST",
      body: form,
    }),

  generateCandidateFromSnapshot: (snapshotId: string) =>
    request<RetrainingCandidate>(`/api/v1/retraining/from-snapshot/${snapshotId}`, {
      method: "POST",
    }),

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

  getSettings: () => request<SettingsResponse>("/api/v1/settings"),

  getProfile: () => request<UserProfileInfo>("/api/v1/settings/profile"),

  getDependencyHealth: () => request<DependencyHealthDetail[]>("/api/v1/settings/health"),

  logout: () => request<LogoutResponse>("/api/v1/auth/logout", { method: "POST" }),
};
