# Task Handover: 5B.3 — Deployments & Real-Time Inference Interface

## A. Task Information
- **Task ID:** Task 5B.3
- **Task Name:** Deployments & Real-Time Inference Interface
- **Implementation Date:** 2026-11-17
- **Git Branch:** `feature/phase5-portfolio-readiness`
- **HEAD Commit:** `3f81afd1c37b607a5a73d997b67636d9e2ef9241`
- **Completion Status:** Completed & Verified

---

## B. Objective
The objective of Task 5B.3 was to replace the placeholder `ComingSoon` component at `/deployments` with an authoritative, production-grade Deployments and Inference interface. The interface integrates directly with the MLForge FastAPI serving architecture (ADR-0005) to provide live deployment slot management (deploy, stop, rollback), real-time serving observability (request count, error rate, average and maximum latency), and an interactive single-record JSON inference playground with schema guidance, live prediction execution, and high-precision latency feedback.

---

## C. Implementation Summary

### Components Created
- `frontend-react/src/pages/Deployments.tsx`: Complete deployments and inference interface comprising:
  - **Serving KPIs Overview:** Real-time counters for Total Deployments, Active Serving Slots, Replaced Deployments, Stopped Slots, Total Predictions Served, and Average Latency.
  - **Serving Slots Table:** Comprehensive table displaying deployed models, versions, active champion pulse tags, deployment IDs, serving status (`active`, `replaced`, `stopped`), request counts, error counts, latency averages, timestamps, and contextual actions.
  - **Deploy Model Modal:** Discovers eligible model versions from the Model Registry (filtered strictly to `staging` or `production`), explaining deployment replacement rules before binding to serving.
  - **Real-Time Single-Record JSON Inference Playground:** Dedicated test harness allowing users to select active deployment slots, view required input feature schemas (discovered from source training jobs), auto-fill sample JSON payloads, validate JSON syntax client-side, execute live predictions against `POST /api/v1/deployments/{id}/predict`, inspect predicted outputs, view sub-millisecond latency, and copy response payloads.
  - **Deployment Details Modal:** Detailed inspection modal displaying bound model versions, timestamps, replaced-by lineage, full request/latency observability metrics, and API endpoint integration code snippets.
  - **Stop & Rollback Confirmation Dialogs:** Consequential action dialogs explaining serving impacts before halting traffic or restoring previous deployments.

### Components Modified
- `frontend-react/src/api/types.ts`:
  - Added `JobDetail` interface extending `JobSummary` with `input_cols`, `model_params`, `metrics`.
  - Added `DeploymentResponse` and `DeploymentMetricsResponse` interfaces.
  - Added `PredictJSONRequest` and `PredictJSONResponse` interfaces.
- `frontend-react/src/api/client.ts`:
  - Added `getJob(jobId)`: `GET /api/v1/jobs/{id}`
  - Added `listDeployments()`: `GET /api/v1/deployments`
  - Added `getDeployment(deploymentId)`: `GET /api/v1/deployments/{id}`
  - Added `deployModel(versionId)`: `POST /api/v1/deployments/{version_id}/deploy`
  - Added `stopDeployment(deploymentId)`: `POST /api/v1/deployments/{id}/stop`
  - Added `rollbackDeployment(deploymentId)`: `POST /api/v1/deployments/{id}/rollback`
  - Added `predictJSON(deploymentId, features)`: `POST /api/v1/deployments/{id}/predict`
- `frontend-react/src/App.tsx`:
  - Removed `ComingSoon` placeholder and mounted `<Deployments />` at `/deployments`.
- `frontend-react/src/pages/ModelRegistry.tsx`:
  - Connected "Deploy to Serving" quick-action to pass `deployVersionId` via React Router `location.state` into the Deployments page.

### Backend APIs Integrated
- `POST /api/v1/deployments/{version_id}/deploy`: Binds staging or production model versions to live serving slots.
- `GET /api/v1/deployments`: Lists all deployments owned by the user.
- `GET /api/v1/deployments/{id}`: Returns deployment metadata coupled with live serving metrics (`request_count`, `error_count`, `avg_latency_ms`, `max_latency_ms`).
- `POST /api/v1/deployments/{id}/stop`: Halts traffic to an active deployment.
- `POST /api/v1/deployments/{id}/rollback`: Reactivates the deployment that was previously replaced.
- `POST /api/v1/deployments/{id}/predict`: Executes single-record JSON inference through the loaded Scikit-learn pipeline and records request telemetry.
- `GET /api/v1/jobs/{id}`: Retrieves training job configuration and input column schema for playground guidance.
- `GET /api/v1/registry`: Discovers models eligible for deployment.

### Services Reused
- `api.deployment_service`: Model serving lifecycle rules, atomic slot replacement, compensating rollback, and `RequestLog` metric aggregation.
- `api.routers.deployments`: FastAPI direct model serving, Pandas row reconstruction, Scikit-learn inference, and latency benchmarking.

### User Workflows Implemented
1. **Model Deployment:** Users select a verified model version from staging or production and deploy it to a live serving slot with automatic replacement of older versions.
2. **Serving Slot Observability:** Real-time visibility into traffic volume, error rates, and response latencies across all historical and active deployments.
3. **Interactive Inference Testing:** In the Inference Playground, users select an active deployment, generate a valid JSON payload matching the model's required input schema, and execute live predictions with instant latency reporting.
4. **Lifecycle Control & Rollback:** Active deployments can be stopped or rolled back to previously superseded versions with atomic database updates.
5. **Cross-Page Workflow Continuity:** Direct navigation from Model Registry versions (`/registry`) into deployment (`/deployments`), and from deployment into inference playground or registry details.

---

## D. Verification & Test Results

### Frontend TypeScript & Vite Production Build
Executed command:
```powershell
cmd.exe /c "cd frontend-react && npm run build"
```
Build Output:
```
> mlforge-frontend@0.1.0 build
> tsc -b && vite build

vite v5.4.11 building for production...
transforming...
✓ 633 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/favicon-CEm-Kg_k.svg      0.43 kB │ gzip:   0.32 kB
dist/index.html                       0.47 kB │ gzip:   0.31 kB
dist/assets/index-StbfW6yt.css       20.92 kB │ gzip:   4.71 kB
dist/assets/index-DDMDU2R0.js     1,327.87 kB │ gzip: 423.40 kB
✓ built in 13.00s
```
Zero TypeScript compilation errors; clean production build.

### Deployment & Serving Backend Tests
Targeted test execution (`tests/test_deployment_monitoring.py`):
```powershell
pytest tests/test_deployment_monitoring.py
```
16 passed tests covering:
- Refusal to deploy development models (requires staging or production).
- Deployment creation and initial metric initialization.
- Deployment replacement and compensating rollback restoring prior deployments.
- Cross-user tenant isolation (User B cannot deploy, inspect, or stop User A's deployments).
- Real-time JSON inference success and latency logging in `RequestLog`.
- Missing required input fields logged as errors with HTTP 400.
- Rejection of predictions against inactive/stopped deployments.

---

## E. Database & Migration Status
- Reuses existing database models:
  - `deployments` table: `id`, `model_version_id`, `owner_id`, `model_name`, `status`, `replaced_by`, `created_at`, `stopped_at`.
  - `request_logs` table: `id`, `deployment_id`, `success`, `latency_ms`, `error_message`, `created_at`.
- No database migrations or schema alterations required.
- Current Alembic revision remains `0005_add_phase4_retraining_tables.py`.

---

## F. Edge Cases & Error Handling
1. **Invalid Lifecycle State for Deployment:** Attempting to deploy a version in `development` or `archived` is blocked by the UI and rejected with HTTP 400 by `deployment_service.deploy`.
2. **Missing Feature Keys:** If a prediction payload is missing required columns, the backend returns HTTP 400 (`Missing required input field(s): [...]`), which is cleanly surfaced in the response panel and logged as an error in the deployment's metrics.
3. **Invalid JSON Formatting:** The inference playground validates JSON syntax on the client before network transmission, flagging syntax errors without failing the request.
4. **Inactive Serving Slots:** The UI warns users when attempting to predict on stopped or replaced deployments, and backend guards return HTTP 400 (`This deployment is not active`).
5. **Rollback Guard:** The "Rollback" action is strictly rendered only when a prior superseded deployment exists with `replaced_by == deployment.id`.

---

## G. Security & Isolation Considerations
- Endpoint requires authentication (`require_auth_if_configured`).
- Multi-tenant deployment isolation: Users can only view, deploy, stop, or predict against deployments they own. Accessing another tenant's deployment returns HTTP 404 to prevent resource enumeration.
- No raw model artifact paths or internal filesystem paths are exposed in frontend payloads.

---

## H. Architectural Decisions & Trade-offs
- **Real Backend Serving vs. Client-Side Mocking:** All predictions execute through the real Scikit-learn pipelines loaded in the FastAPI server. Latencies and prediction values are live.
- **Dynamic Schema Discovery:** Rather than hardcoding feature fields, the inference playground queries the underlying training job to dynamically discover required feature names.
- **Atomic Replacement Policy:** Consistent with ADR-0005, only one deployment is active per `(owner_id, model_name)`. Deploying a newer version preserves the predecessor for immediate rollback.

---

## I. Known Limitations & Deferred Work
- Streaming batch inference is handled via `POST /api/v1/predict` (file-based); the playground is optimized for real-time single-record JSON inspection.
- Auto-scaling container clusters (Kubernetes / KServe) remain deferred; FastAPI serves models directly within process boundaries.

---

## J. Backward Compatibility & Breaking Changes
- Zero breaking changes.
- Existing job prediction and drift monitoring endpoints remain fully compatible.

---

## K. Reviewer Verification Guide
1. Start the backend API:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   uvicorn api.main:app --port 8000
   ```
2. Start the frontend development server:
   ```powershell
   cd frontend-react
   npm run dev
   ```
3. Navigate to `http://localhost:5173/deployments`.
4. Click **"Deploy Model"** in the top right.
5. Select a staging or production model version (e.g. `Logistic Regression v1`) and click **"Confirm Deployment"**.
6. Verify that the deployment appears in the table with an active green pulse badge.
7. Click **"Predict"** on the active deployment to open the **Inference Playground**.
8. Notice the required feature tags (e.g. `age`, `city`). Click **"Auto-fill Sample JSON"** to populate valid inputs.
9. Click **"Execute Prediction"**.
10. Verify that the predicted value is returned along with real-time latency (e.g. `0.95 ms`).
11. Return to the **"Serving Slots"** tab and verify that the request counter incremented to `1 call`.
12. Click **"Details"** to inspect the live serving latency statistics and API integration snippet.

---

## L. Recommended Next Steps
Proceed to Phase 5B.4: Implement Monitoring UI (`frontend-react/src/pages/Monitoring.tsx`), replacing `ComingSoon` at `/monitoring` with Evidently data drift reports, feature-level drift distribution tables, and quick-action triggers for retraining candidate generation.
