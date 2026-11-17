import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  ApiError,
  type ContinuousDistribution,
  type DatasetProfileResponse,
  type JobSummary,
} from "../api/types";
import { Card, CardHeader } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";

function isContinuous(
  dist: Record<string, number> | ContinuousDistribution | null
): dist is ContinuousDistribution {
  return dist !== null && "mean" in dist && "std" in dist;
}

export function Datasets() {
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState<"profile" | "history">("profile");

  // Profiler state
  const [file, setFile] = useState<File | null>(null);
  const [targetCol, setTargetCol] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);

  // Column table filtering
  const [columnSearch, setColumnSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "numeric" | "categorical">("all");

  // History state
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    setLoadingJobs(true);
    api
      .listJobs()
      .then((data) => setJobs(data.filter((j) => Boolean(j.dataset_filename))))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select a CSV dataset file first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (targetCol.trim()) {
        form.append("target_col", targetCol.trim());
      }

      const res = await api.profileDataset(form);
      setProfile(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to profile dataset.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith(".csv")) {
        setError("Only CSV files are currently supported for profiling.");
        return;
      }
      setFile(droppedFile);
      setError(null);
    }
  }

  function handleUseInTraining() {
    if (!profile) return;
    const inputCols = profile.columns
      .filter((c) => c.name !== profile.target_column && !c.is_constant)
      .map((c) => c.name)
      .join(",");
    navigate("/train", {
      state: {
        targetCol: profile.target_column ?? "",
        inputCols,
      },
    });
  }

  // Filter columns
  const filteredColumns = useMemo(() => {
    if (!profile) return [];
    return profile.columns.filter((col) => {
      const matchesSearch = col.name.toLowerCase().includes(columnSearch.toLowerCase());
      const isNumeric = col.dtype.includes("int") || col.dtype.includes("float");
      if (typeFilter === "numeric") return matchesSearch && isNumeric;
      if (typeFilter === "categorical") return matchesSearch && !isNumeric;
      return matchesSearch;
    });
  }, [profile, columnSearch, typeFilter]);

  // Aggregate missingness
  const totalMissingCells = useMemo(() => {
    if (!profile) return 0;
    return profile.columns.reduce((sum, col) => sum + col.missing_count, 0);
  }, [profile]);

  const totalCells = useMemo(() => {
    if (!profile) return 1;
    return profile.n_rows * profile.n_columns;
  }, [profile]);

  const missingPct = useMemo(() => {
    if (!profile || totalCells === 0) return 0;
    return ((totalMissingCells / totalCells) * 100).toFixed(2);
  }, [profile, totalMissingCells, totalCells]);

  // Unique datasets from jobs history
  const uniqueDatasets = useMemo(() => {
    const map = new Map<string, { filename: string; lastSeen: string; count: number; lastJobId: string }>();
    for (const job of jobs) {
      if (!job.dataset_filename) continue;
      const existing = map.get(job.dataset_filename);
      if (!existing) {
        map.set(job.dataset_filename, {
          filename: job.dataset_filename,
          lastSeen: job.created_at,
          count: 1,
          lastJobId: job.id,
        });
      } else {
        existing.count += 1;
      }
    }
    return Array.from(map.values());
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[28px] font-bold text-ink">Dataset Management</h1>
          <p className="text-sm text-muted">
            Inspect data quality, missingness, class imbalance, and detect potential leakage before model training.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-lg border border-line bg-surface p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "profile" ? "bg-primary text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Icon name="datasets" className="h-4 w-4" />
            Profiler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "history" ? "bg-primary text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Icon name="clock" className="h-4 w-4" />
            Workspace Datasets ({uniqueDatasets.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="alert-triangle" className="h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <span className="font-semibold">Validation Error:</span> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeTab === "profile" ? (
        <>
          {/* Upload & Config Card */}
          <Card>
            <CardHeader
              icon={<Icon name="upload" className="h-5 w-5 text-primary" />}
              title="Upload & Profile Dataset"
              subtitle="Drop a CSV file to execute client-safe statistical validation and heuristic leakage checks"
            />

            <form onSubmit={handleProfile} className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-primary/50 bg-bg"
                    : "border-line bg-bg hover:border-primary/40"
                }`}
              >
                <input
                  type="file"
                  accept=".csv"
                  id="csv-file-input"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setError(null);
                    }
                  }}
                />

                <Icon
                  name={file ? "check-circle" : "upload"}
                  className={`h-10 w-10 ${file ? "text-primary" : "text-muted"}`}
                />

                {file ? (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-ink">{file.name}</p>
                    <p className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB — Ready to profile</p>
                    <label
                      htmlFor="csv-file-input"
                      className="mt-2 inline-block cursor-pointer text-xs font-medium text-primary hover:underline"
                    >
                      Change file
                    </label>
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-ink">
                      Drag &amp; drop your CSV here, or{" "}
                      <label htmlFor="csv-file-input" className="cursor-pointer text-primary hover:underline">
                        browse
                      </label>
                    </p>
                    <p className="mt-1 text-xs text-muted">Supports CSV files up to 200MB</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Target Column (Optional)
                  </label>
                  <input
                    type="text"
                    value={targetCol}
                    onChange={(e) => setTargetCol(e.target.value)}
                    placeholder="e.g. churn, price, label (leave blank for unsupervised profiling)"
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-muted">
                    Specifying target unlocks class imbalance ratio calculation and correlation leakage alerts.
                  </p>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={!file || loading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Icon name="chart" className="h-4 w-4" />
                        Run Quality Profiling
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </Card>

          {/* Profile Results */}
          {profile && (
            <div className="space-y-6">
              {/* Quality & Leakage Warnings Alert Section */}
              {profile.leakage_warnings.length > 0 ? (
                <div className="rounded-card border border-amber/30 bg-amber/5 p-5">
                  <div className="flex items-center gap-2 text-amber">
                    <Icon name="alert-triangle" className="h-5 w-5" />
                    <h3 className="font-semibold text-ink">
                      Data Quality &amp; Leakage Warnings ({profile.leakage_warnings.length})
                    </h3>
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-ink">
                    {profile.leakage_warnings.map((warning, idx) => (
                      <li key={idx} className="flex items-start gap-2 rounded bg-surface p-2.5 border border-line/60">
                        <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-amber shrink-0" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-card border border-green-200 bg-green-50/50 p-4 text-xs text-green-900">
                  <Icon name="check-circle" className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-sm">Clean Dataset Health:</span> No severe leakage, excessive duplicate rows, or extreme class imbalance detected.
                  </div>
                </div>
              )}

              {/* High-level Metric Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Card className="flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted uppercase">Rows</span>
                  <div className="mt-2 text-2xl font-bold text-ink">{profile.n_rows.toLocaleString()}</div>
                  <span className="mt-1 text-[11px] text-muted">Total observations</span>
                </Card>

                <Card className="flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted uppercase">Columns</span>
                  <div className="mt-2 text-2xl font-bold text-ink">{profile.n_columns}</div>
                  <span className="mt-1 text-[11px] text-muted">Feature dimensionality</span>
                </Card>

                <Card className="flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted uppercase">Duplicate Rows</span>
                  <div
                    className={`mt-2 text-2xl font-bold ${
                      profile.duplicate_rows > 0 ? "text-amber" : "text-ink"
                    }`}
                  >
                    {profile.duplicate_rows.toLocaleString()}
                  </div>
                  <span className="mt-1 text-[11px] text-muted">
                    {((profile.duplicate_rows / (profile.n_rows || 1)) * 100).toFixed(1)}% of rows
                  </span>
                </Card>

                <Card className="flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted uppercase">Missing Cells</span>
                  <div
                    className={`mt-2 text-2xl font-bold ${
                      totalMissingCells > 0 ? "text-amber" : "text-ink"
                    }`}
                  >
                    {totalMissingCells.toLocaleString()}
                  </div>
                  <span className="mt-1 text-[11px] text-muted">{missingPct}% matrix missingness</span>
                </Card>

                <Card className="flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted uppercase">Constant Features</span>
                  <div
                    className={`mt-2 text-2xl font-bold ${
                      profile.constant_columns.length > 0 ? "text-red-600" : "text-ink"
                    }`}
                  >
                    {profile.constant_columns.length}
                  </div>
                  <span className="mt-1 text-[11px] text-muted">Zero variance columns</span>
                </Card>
              </div>

              {/* Target Column Analysis (if supplied) */}
              {profile.target_column && (
                <Card>
                  <CardHeader
                    icon={<Icon name="chart" className="h-5 w-5 text-primary" />}
                    title={`Target Column Analysis: "${profile.target_column}"`}
                    subtitle="Distribution metrics and class balance evaluation"
                    action={
                      profile.class_imbalance_ratio !== null && (
                        <div
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            profile.class_imbalance_ratio >= 10
                              ? "bg-red-100 text-red-800"
                              : profile.class_imbalance_ratio >= 3
                              ? "bg-amber/15 text-amber"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          Imbalance Ratio: {profile.class_imbalance_ratio}:1
                        </div>
                      )
                    }
                  />

                  {profile.target_distribution && (
                    <div className="mt-3">
                      {isContinuous(profile.target_distribution) ? (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <div className="rounded-lg border border-line bg-bg p-3">
                            <span className="text-xs text-muted">Minimum</span>
                            <div className="text-lg font-semibold text-ink">
                              {profile.target_distribution.min.toFixed(3)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-line bg-bg p-3">
                            <span className="text-xs text-muted">Maximum</span>
                            <div className="text-lg font-semibold text-ink">
                              {profile.target_distribution.max.toFixed(3)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-line bg-bg p-3">
                            <span className="text-xs text-muted">Mean</span>
                            <div className="text-lg font-semibold text-ink">
                              {profile.target_distribution.mean.toFixed(3)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-line bg-bg p-3">
                            <span className="text-xs text-muted">Std. Deviation</span>
                            <div className="text-lg font-semibold text-ink">
                              {profile.target_distribution.std.toFixed(3)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Class Frequency Breakdown
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                            {Object.entries(profile.target_distribution).map(([cls, count]) => {
                              const share = ((count / profile.n_rows) * 100).toFixed(1);
                              return (
                                <div key={cls} className="rounded-lg border border-line bg-bg p-3">
                                  <div className="flex justify-between text-xs">
                                    <span className="font-semibold text-ink">Class {cls}</span>
                                    <span className="text-muted">
                                      {count.toLocaleString()} ({share}%)
                                    </span>
                                  </div>
                                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                                    <div
                                      className="h-full bg-primary"
                                      style={{ width: `${share}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Column Profile Table */}
              <Card>
                <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink">Feature Breakdown ({profile.columns.length})</h3>
                    <p className="text-xs text-muted">Type inference, missingness percentage, and unique cardinalities</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search columns..."
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                        className="rounded-lg border border-line bg-bg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                      />
                      <Icon name="search" className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
                    </div>

                    <div className="flex rounded-md border border-line bg-bg p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setTypeFilter("all")}
                        className={`rounded px-2.5 py-1 ${
                          typeFilter === "all" ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter("numeric")}
                        className={`rounded px-2.5 py-1 ${
                          typeFilter === "numeric" ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted"
                        }`}
                      >
                        Numeric
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter("categorical")}
                        className={`rounded px-2.5 py-1 ${
                          typeFilter === "categorical" ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted"
                        }`}
                      >
                        Categorical
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg text-muted font-semibold uppercase tracking-wider border-b border-line">
                      <tr>
                        <th className="py-3 px-4">Column Name</th>
                        <th className="py-3 px-4">Inferred Type</th>
                        <th className="py-3 px-4">Missing Values</th>
                        <th className="py-3 px-4">Unique Values</th>
                        <th className="py-3 px-4">Characteristics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {filteredColumns.map((col) => {
                        const isTarget = col.name === profile.target_column;
                        const isConstant = col.is_constant;
                        const hasMissing = col.missing_count > 0;

                        return (
                          <tr key={col.name} className="hover:bg-bg/50 transition-colors">
                            <td className="py-3 px-4 font-medium text-ink">
                              <div className="flex items-center gap-2">
                                <span>{col.name}</span>
                                {isTarget && (
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                    Target
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="rounded bg-line/60 px-2 py-0.5 font-mono text-[11px] text-ink">
                                {col.dtype}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={hasMissing ? "text-amber font-semibold" : "text-muted"}>
                                  {col.missing_count} ({col.missing_pct}%)
                                </span>
                                {hasMissing && (
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                                    <div
                                      className="h-full bg-amber"
                                      style={{ width: `${Math.min(col.missing_pct, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-ink">
                              {col.n_unique.toLocaleString()}
                              <span className="ml-1 text-[10px] text-muted">
                                ({((col.n_unique / profile.n_rows) * 100).toFixed(0)}%)
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isConstant ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                  Constant (Zero Variance)
                                </span>
                              ) : col.n_unique === profile.n_rows ? (
                                <span className="rounded-full bg-line px-2 py-0.5 text-[10px] text-muted">
                                  Unique Identifier
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                  Valid Feature
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Forward Workflow Stitching Banner */}
              <div className="flex flex-col items-center justify-between gap-4 rounded-card border border-line bg-gradient-to-r from-surface to-bg p-6 sm:flex-row shadow-sm">
                <div>
                  <h4 className="text-base font-semibold text-ink">Proceed with Profiled Dataset</h4>
                  <p className="text-xs text-muted">
                    Use these features and target column directly in single-model training or AutoML candidate search.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleUseInTraining}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Icon name="train-model" className="h-4 w-4" />
                    Train a Model
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/experiments")}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-bg transition-colors"
                  >
                    <Icon name="experiments" className="h-4 w-4" />
                    Find Best Model (AutoML)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Initial Blank State (Before Profile) */}
          {!profile && !loading && (
            <Card>
              <div className="py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon name="datasets" className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-ink">No Dataset Profile Loaded</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                  Upload a CSV file above to compute comprehensive dataset summary metrics, detect duplicate rows, check class balance, and identify data leakage risks.
                </p>

                <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 text-left">
                  <div className="rounded-lg border border-line bg-bg p-3">
                    <div className="font-semibold text-xs text-ink">1. Missingness &amp; Duplicates</div>
                    <p className="mt-1 text-[11px] text-muted">
                      Quantifies cell missingness across columns and flags duplicate observations.
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-bg p-3">
                    <div className="font-semibold text-xs text-ink">2. Imbalance Heuristics</div>
                    <p className="mt-1 text-[11px] text-muted">
                      Evaluates target class ratios and alerts if imbalance exceeds 10:1.
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-bg p-3">
                    <div className="font-semibold text-xs text-ink">3. Leakage Detection</div>
                    <p className="mt-1 text-[11px] text-muted">
                      Flags features with near-perfect correlation (|r| &gt;= 0.98) with target.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : (
        /* History Tab */
        <Card>
          <CardHeader
            icon={<Icon name="database" className="h-5 w-5 text-primary" />}
            title="Workspace Ingested Datasets"
            subtitle="Datasets historically uploaded and processed by training jobs in this workspace"
          />

          {loadingJobs ? (
            <div className="py-8 text-center text-xs text-muted">Loading workspace datasets...</div>
          ) : uniqueDatasets.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No datasets have been ingested through training jobs yet. Upload a CSV in the Profiler tab to start.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg text-muted font-semibold uppercase tracking-wider border-b border-line">
                  <tr>
                    <th className="py-3 px-4">Dataset Filename</th>
                    <th className="py-3 px-4">Last Ingested</th>
                    <th className="py-3 px-4">Jobs Associated</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {uniqueDatasets.map((ds) => (
                    <tr key={ds.filename} className="hover:bg-bg/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-ink flex items-center gap-2">
                        <Icon name="database" className="h-4 w-4 text-primary" />
                        {ds.filename}
                      </td>
                      <td className="py-3 px-4 text-muted">
                        {new Date(ds.lastSeen).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-ink">
                        <span className="rounded bg-line/60 px-2 py-0.5 text-[11px]">
                          {ds.count} {ds.count === 1 ? "job" : "jobs"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("profile");
                          }}
                          className="font-medium text-primary hover:underline"
                        >
                          Profile new copy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}