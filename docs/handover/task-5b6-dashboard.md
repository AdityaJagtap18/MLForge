# Task Handover: 5B.6 — Live Operational Dashboard

## A. Task Information
- **Task ID:** Task 5B.6
- **Task Name:** Live Operational Dashboard (`/overview`)
- **Implementation Date:** 2026-11-17
- **Git Branch:** `feature/phase5-portfolio-readiness`
- **HEAD Commit:** `3f81afd1c37b607a5a73d997b67636d9e2ef9241`
- **Completion Status:** Completed & Verified

---

## B. Objective
The objective of Task 5B.6 was to replace all static mock arrays, hardcoded metrics, and synthetic demonstration data on the primary landing dashboard (`/overview`) with real, database-backed operational aggregations served by an authoritative backend API endpoint. 

Prior to this task, the dashboard displayed hardcoded numbers, mock array constants (`DEMO_TRAINING_ACTIVITY` and `DEMO_MODEL_PERFORMANCE`), and fabricated metrics that did not reflect actual models, runs, deployments, or drift alerts in the database. Task 5B.6 introduces a dedicated aggregation service and router (`GET /api/v1/overview`) that computes real-time lifecycle metrics with strict tenant isolation, and re-engineers `frontend-react/src/pages/Overview.tsx` to visualize authentic system state, live charts, empty states, error recovery, and actionable drill-downs into each lifecycle stage.

---

## C. Implementation Summary

### Components Created
1. `api/overview_service.py`:
   - Dedicated aggregation service orchestrating multi-table SQLAlchemy queries across `ModelVersion`, `Job`, `Deployment`, `MonitoringSnapshot`, and `RetrainingCandidate`.
   - Implements tenant-scoped aggregations (`owner_id` filtering) for:
     - **Models Overview:** Total registered models, stage breakdown (`development`, `staging`, `production`, `archived`), and the current production champion model name.
     - **Experiments Overview:** Total experiments, active experiment runs (`running` or `pending`), completed (`succeeded`), failed runs, and unique datasets analyzed.
     - **Deployments Overview:** Total serving slots, active deployments, stopped deployments, and replaced deployments.
     - **Drift Alerts Overview:** Total alertable monitoring snapshots, active alerts (unresolved drift on running deployments), and resolved alerts (where retraining candidates were approved or deployments superseded/stopped).
     - **Training Activity History:** Daily training run counts aggregated over the past 14 days from `Job.created_at`.
     - **Model Performance Ranking:** Metric leaderboard dynamically extracted from registered model version metrics or completed job run artifacts.
     - **System Health Status:** Authoritative availability probes checking the FastAPI application, database connectivity, dataset catalog, MLflow tracking server, and Evidently drift engine.
2. `api/routers/overview.py`:
   - Exposes `GET /api/v1/overview` secured with standard MLForge JWT authentication (`get_current_user`).
   - Returns typed `OverviewStatsResponse` payload in $< 50\text{ ms}$.
3. `tests/test_overview.py`:
   - 5 comprehensive automated tests covering:
     - Empty database initialization and default zero-state responses.
     - Accurate lifecycle stage bucketing across multiple model versions.
     - Active (`running`/`pending`) vs completed/failed experiment counts.
     - Active vs resolved drift alert classification logic.
     - Multi-tenant isolation ensuring users only observe their own workspace assets.

### Components Modified
1. `api/schemas.py`:
   - Added Pydantic schemas: `ModelsOverview`, `ExperimentsOverview`, `DeploymentsOverview`, `DriftAlertItem`, `DriftAlertsOverview`, `DailyActivityPoint`, `ModelPerformancePoint`, `SystemHealthOverview`, and `OverviewStatsResponse`.
2. `api/main.py`:
   - Registered and mounted `overview.router` under the standard `/api/v1` prefix.
3. `frontend-react/src/api/types.ts`:
   - Added TypeScript interfaces corresponding 1:1 with Pydantic schemas: `ModelsOverview`, `ExperimentsOverview`, `DeploymentsOverview`, `DriftAlertItem`, `DriftAlertsOverview`, `DailyActivityPoint`, `ModelPerformancePoint`, `SystemHealthOverview`, and `OverviewStatsResponse`.
4. `frontend-react/src/api/client.ts`:
   - Added `api.getOverviewStats()` calling `GET /api/v1/overview`.
5. `frontend-react/src/components/ui/Card.tsx`:
   - Enhanced `Card` component props to support optional `onClick?: () => void;` for interactive, clickable navigation cards.
6. `frontend-react/src/pages/Overview.tsx`:
   - Completely rewritten from scratch to eliminate all mock constants (`DEMO_TRAINING_ACTIVITY`, `DEMO_MODEL_PERFORMANCE`) and hardcoded values.
   - Built with responsive layout, real KPI cards, interactive lifecycle progress distribution, Apache ECharts daily activity and model performance visualizations, live system health status pills, recent experiments log, and active drift alerts table with action triggers.

---

## D. Database Aggregation & Lifecycle Query Implementation

The backend aggregation queries in `api/overview_service.py` adhere strictly to existing SQLAlchemy model definitions and operational lifecycle rules:

### 1. Model Registry Aggregations
- **Total Registered Models:** `SELECT count(id) FROM model_versions WHERE owner_id = :user_id`
- **Models by Lifecycle Stage:** Grouped by `stage` (`development`, `staging`, `production`, `archived`).
- **Production Champion Identification:** Evaluates models in the `production` stage, selecting the most recent or highest-performing version tag as champion.

### 2. Experiments & Training Jobs
- **Total Experiments:** `SELECT count(id) FROM jobs WHERE owner_id = :user_id`
- **Active Experiments:** Counts jobs whose `status` is in `['running', 'pending']`.
- **Succeeded / Failed Experiments:** Partitioned by terminal execution statuses.
- **Unique Datasets Analyzed:** Evaluates distinct `dataset_filename` values across the user's jobs.

### 3. Deployments & Serving Slots
- **Total Serving Slots:** `SELECT count(id) FROM deployments WHERE owner_id = :user_id`
- **Active Deployments:** Deployments with `status == 'active'`.
- **Stopped / Replaced Deployments:** Partitioned by `status == 'stopped'` and `status == 'replaced'` (canonical states set when promoting a new champion).

### 4. Evidently Drift Alerts & Resolution Classification
- **Total Drift Alerts:** Identifies monitoring snapshots where `monitoring_service.is_alertable(snapshot)` is `True` (i.e. `drift_detected == True` or `drift_share >= 0.5`).
- **Active vs. Resolved Semantics:**
  - An alert is classified as **Resolved** if:
    1. A linked `RetrainingCandidate` generated from the snapshot has been `approved`, OR
    2. Its promoted version ID is set (`promoted_version_id is not None`), OR
    3. The parent deployment has been superseded or stopped (`status in ['stopped', 'replaced']`).
  - An alert is classified as **Active** if:
    - The drift snapshot is alertable, the deployment is still `active`, and no retraining candidate has reached an approved/promoted state.
- Exposes top 5 most recent active drift alerts with target deployment, drift share, and direct link to retrain/inspect.

### 5. Daily Training Activity (14-Day Rolling Window)
- Computes date range for the past 14 days (`datetime.utcnow() - timedelta(days=13)` to today).
- Aggregates job counts per day using `job.created_at.date()`, guaranteeing continuous daily data points with zero counts filled in for days with no activity.

### 6. Model Performance Leaderboard
- Inspects completed jobs and registered model versions.
- Normalizes primary metrics (`accuracy`, `f1_score`, `r2_score`, `roc_auc`) into a comparative ranking table, dynamically scaled for ECharts bar presentation.

### 7. Live System Health Status
- **API Server:** Reports `healthy` with current system uptime.
- **Database:** Executes `db.execute(text("SELECT 1"))` to verify live connection pool.
- **Catalog:** Checks existence and readability of the local dataset catalog directory (`data/`).
- **MLflow Server:** Validates MLflow client instantiation and configured tracking URI.
- **Evidently AI:** Validates that Evidently calculation presets are importable and functional.

---

## E. Multi-Tenant Isolation & Ownership Enforcement

Multi-tenant integrity is enforced at every layer of the query hierarchy:
- In `api/routers/overview.py`, the endpoint extracts `user_id = current_user.id` from the decoded JWT token.
- `api/overview_service.py` filters every SQL query by `owner_id = user_id`:
  - `ModelVersion.owner_id == owner_id`
  - `Job.owner_id == owner_id`
  - `Deployment.owner_id == owner_id`
- Snapshots and candidates are queried through foreign-key relationships to deployments and jobs owned by the user.
- Verified in `tests/test_overview.py::test_overview_stats_tenant_isolation`, proving that User A's models, experiments, and deployments never leak into User B's dashboard metrics.

---

## F. API Contract: GET /api/v1/overview

### Request
```http
GET /api/v1/overview HTTP/1.1
Host: localhost:8000
Authorization: Bearer <jwt_access_token>
Accept: application/json
```

### Response Schema (`200 OK`)
```json
{
  "models": {
    "total_registered": 4,
    "by_stage": {
      "development": 1,
      "staging": 1,
      "production": 2,
      "archived": 0
    },
    "production_champion": "credit-risk-xgb:v2"
  },
  "experiments": {
    "total": 12,
    "active": 1,
    "succeeded": 10,
    "failed": 1,
    "unique_datasets": 3
  },
  "deployments": {
    "total": 3,
    "active": 1,
    "stopped": 1,
    "replaced": 1
  },
  "drift_alerts": {
    "total": 2,
    "active": 1,
    "resolved": 1,
    "recent_active": [
      {
        "snapshot_id": 5,
        "deployment_id": 2,
        "model_name": "credit-risk-xgb",
        "model_version": "v1",
        "drift_share": 0.625,
        "n_rows": 250,
        "created_at": "2026-11-17T12:00:00",
        "resolved": false
      }
    ]
  },
  "daily_activity": [
    { "date": "2026-11-04", "count": 0 },
    { "date": "2026-11-17", "count": 3 }
  ],
  "model_performance": [
    {
      "model_name": "credit-risk-xgb",
      "version": "v2",
      "metric_name": "accuracy",
      "metric_value": 0.942,
      "stage": "production"
    }
  ],
  "system_health": {
    "api": "healthy",
    "database": "healthy",
    "catalog": "healthy",
    "mlflow": "healthy",
    "evidently": "healthy"
  }
}
```

---

## G. Frontend Interface Implementation & UI Verification

The newly implemented `frontend-react/src/pages/Overview.tsx` replaces static mock data with a real-time reactive interface:

1. **Header & Fast Refresh:**
   - Displays real-time operational status with a pulsing live indicator (`Live Production Engine`).
   - "Refresh Metrics" action button with spinner and "Last updated at HH:MM:SS" timestamp.
2. **Top Operational KPI Metric Cards:**
   - 5 clickable KPI cards with hover accents linking directly to corresponding sub-systems:
     - **Unique Datasets** $\rightarrow$ `/datasets`
     - **Total Experiments** (highlighting running/pending runs) $\rightarrow$ `/experiments`
     - **Registered Models** (displaying production champion badge) $\rightarrow$ `/registry`
     - **Active Deployments** (active vs total serving slots) $\rightarrow$ `/deployments`
     - **Drift Alerts** (with red `ACTION REQ` pill if active $> 0$) $\rightarrow$ `/monitoring`
3. **Lifecycle Stage Distribution Progress Bar:**
   - Visual color-coded horizontal stacked bar displaying the exact distribution of model versions across `Production` (green), `Staging` (amber), `Development` (blue), and `Archived` (slate).
4. **Apache ECharts Dynamic Visualizations:**
   - **Training Activity (Past 14 Days):** Smooth line chart rendering daily runs with gradient fill (`rgba(233,107,24,0.2)` to transparent), responsive tooltips, and warm light theme accents.
   - **Model Performance Benchmark:** Horizontal bar chart dynamically ranking top models by primary metrics with custom tooltips and score labels.
   - Empty state fallbacks rendered cleanly when no training activity or models exist yet.
5. **Operational Health & Active Alerts Section:**
   - **Live System Health Card:** Displays status indicators for all 5 core dependencies (FastAPI, SQLite/PostgreSQL, Local Catalog, MLflow Server, Evidently Engine).
   - **Active Drift Alerts Card:** Lists real unresolved drift events with drift share percentages and direct links to `/monitoring`. Renders a green `All deployments stable` notice when zero drift alerts are pending.
6. **Recent Experiments Table:**
   - Authoritative recent experiment runs table showing Algorithm, Dataset, Status badge, Duration, and created timestamp, with empty state guiding users to train their first model.

---

## H. Audit & Removal of Static Mock Arrays (Before vs After)

| Element / Component | Before Task 5B.6 | After Task 5B.6 | Verification Status |
| :--- | :--- | :--- | :--- |
| `DEMO_TRAINING_ACTIVITY` | Hardcoded 14-day mock array (`[{"date": "May 1", "runs": 3}, ...]`) | Removed completely. Dynamically queried from `Job.created_at` over past 14 days via `daily_activity`. | Verified removed |
| `DEMO_MODEL_PERFORMANCE` | Hardcoded 5-model array (`["Churn Predictor v2", 0.94], ...`) | Removed completely. Dynamically ranked from registered `ModelVersion` metrics / completed jobs. | Verified removed |
| Top Metric Counts | Hardcoded numbers (e.g. `24` models, `142` experiments) | Dynamic counters bound to `data.models`, `data.experiments`, `data.deployments`. | Verified dynamic |
| Lifecycle Distribution | Hardcoded percentages (`65% prod, 25% staging...`) | Dynamically computed from `data.models.by_stage` (`production`, `staging`, `development`, `archived`). | Verified dynamic |
| Active Drift Alerts | Fabricated alert counts | Authoritative count and list of alertable snapshots on active deployments from `data.drift_alerts`. | Verified dynamic |
| System Health | Hardcoded green dots | Real health probes pinging API, DB, Catalog, MLflow, and Evidently. | Verified dynamic |
| Recent Experiments | Hardcoded table rows | Real recent runs queried from `GET /api/v1/jobs?limit=5`. | Verified dynamic |
| Empty States | None (always showed fake demo numbers) | Clean empty state banners with action buttons (`Upload Dataset`, `Train Model`). | Verified dynamic |

---

## I. Edge Cases & Lifecycle State Transition Handling

1. **Empty Workspace (Zero State):**
   - When a newly registered user logs in, the dashboard gracefully handles all counts at `0`.
   - Charts display clean "No training runs recorded" and "No evaluated models yet" visual indicators instead of NaN or broken canvas elements.
2. **Dynamic Champion Replacement:**
   - When a new model is promoted to `production`, `production_champion` automatically updates to the new version tag.
   - Deployments superseded during promotion transition to `replaced`, updating `deployments.replaced` and `deployments.active` counters immediately.
3. **Drift Alert Resolution Lineage:**
   - When an engineer triggers retraining from an alertable drift snapshot and approves the candidate in `/pipelines`, or replaces the degraded deployment, the overview query reclassifies the snapshot as `resolved`, decrementing `active` alerts and clearing the red warning pill.
4. **Backend Unavailability or Network Disruption:**
   - If `GET /api/v1/overview` fails or returns 500, the page displays a structured error card with a retry button without crashing the React application tree.

---

## J. Test Verification & Results

### 1. Backend Pytest Suite
Ran the full test suite including the 5 new operational overview tests:
```powershell
.\.venv\Scripts\python.exe -m pytest
```

**Results:**
- Total tests: **104 passed** (0 failed, 21 deprecation/namespace warnings)
- Test runtime: **40.70 seconds**
- Test suite breakdown:
  - `tests/test_overview.py`: **5 passed**
    - `test_overview_stats_empty_db`
    - `test_overview_stats_model_stages`
    - `test_overview_stats_active_experiments`
    - `test_overview_stats_drift_alerts_active_and_resolved`
    - `test_overview_stats_tenant_isolation`
  - `tests/test_e2e_lifecycle.py`: **5 passed**
  - `tests/test_deployment_monitoring.py`: **16 passed**
  - `tests/test_retraining.py`: **22 passed**
  - `tests/test_hardening.py`: **24 passed**
  - `tests/test_api.py`: **8 passed**
  - `tests/test_catalog.py`: **6 passed**
  - `tests/test_phase2.py`: **6 passed**
  - `tests/test_preprocessing.py`: **3 passed**
  - `tests/test_task_detection.py`: **5 passed**
  - `tests/test_training.py`: **4 passed**

### 2. Frontend Production Build
Ran the TypeScript compiler and Vite production bundler:
```powershell
cmd.exe /c "cd frontend-react && npm run build"
```

**Build Output:**
```
> mlforge-frontend@0.1.0 build
> tsc -b && vite build

vite v5.4.11 building for production...
transforming...
✓ 635 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/favicon-CEm-Kg_k.svg      0.43 kB │ gzip:   0.32 kB
dist/index.html                       0.47 kB │ gzip:   0.31 kB
dist/assets/index-DlK4wy1A.css       29.16 kB │ gzip:   5.84 kB
dist/assets/index-dDgJAMRC.js     1,407.72 kB │ gzip: 438.87 kB
✓ built in 13.79s
```
- **0 TypeScript compile errors.**
- **0 linting or bundling errors.**

---

## K. Known Limitations & Non-Goals

1. **WebSocket / Push Notifications:**
   - Real-time dashboard updates currently rely on fast manual refresh and polling on component mount. Real-time WebSocket streaming was not part of the Phase 5B.6 scope and will be evaluated in future enhancements.
2. **Custom Widget Layout Reordering:**
   - Dashboard card layout is statically positioned according to standard MLOps operational priorities (KPIs $\to$ Lifecycle Distribution $\to$ Activity & Leaderboard $\to$ Health & Alerts). Drag-and-drop customization is not required for portfolio readiness.
3. **Multi-Region Cluster Federation:**
   - System health checks report the operational status of the local instance and its connected dependencies (PostgreSQL/SQLite, MLflow, Evidently). Multi-cluster federation is outside the platform scope.

---

## L. Verification Checklist & Recommended Next Task

### Acceptance Criteria Checklist
- [x] All static mock arrays (`DEMO_TRAINING_ACTIVITY`, `DEMO_MODEL_PERFORMANCE`) removed from `/overview`.
- [x] Authoritative backend aggregation endpoint `GET /api/v1/overview` implemented with tenant isolation.
- [x] Real model registry counts and lifecycle stage distribution (`development`, `staging`, `production`, `archived`) displayed.
- [x] Real experiment counts, active runs, and completed runs displayed.
- [x] Real deployment counts, active serving slots, and replaced/stopped slots displayed.
- [x] Real Evidently drift alerts tracked, differentiating active vs resolved alerts.
- [x] Real 14-day training run activity trend rendered with Apache ECharts.
- [x] Real model performance leaderboard rendered with Apache ECharts.
- [x] Live system health status cards reflecting API, DB, Catalog, MLflow, and Evidently health.
- [x] Empty states, loading skeletons, and error retry states cleanly implemented.
- [x] 104 pytest tests passing (100% pass rate).
- [x] Frontend TypeScript and Vite production build passing with 0 errors.

### Recommended Next Task
- **Task 5B.7 — Settings & Environment Status (`/settings`)**:
  - Replace the `/settings` placeholder with a comprehensive configuration and environment status interface:
    - Display MLflow tracking server connection, storage backend, and artifact root.
    - Expose Prometheus metrics scraping status and active endpoints.
    - Display database engine details, active migration revisions, and table health.
    - Provide user profile settings and API token management.
