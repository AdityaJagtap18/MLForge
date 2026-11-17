# Task Handover: 5B.4 — Monitoring & Drift Intelligence Interface

## A. Task Information
- **Task ID:** Task 5B.4
- **Task Name:** Monitoring & Drift Intelligence Interface
- **Implementation Date:** 2026-11-17
- **Git Branch:** `feature/phase5-portfolio-readiness`
- **HEAD Commit:** `3f81afd1c37b607a5a73d997b67636d9e2ef9241`
- **Completion Status:** Completed & Verified

---

## B. Objective
The objective of Task 5B.4 was to replace the placeholder `ComingSoon` component at `/monitoring` with an authoritative, production-grade Monitoring & Drift Intelligence interface. The page exposes MLForge's Evidently-based data drift evaluation system (ADR-0003), allows ML engineers to upload production inference windows against active deployments, tracks snapshot evaluation history, presents dataset drift verdicts and feature drift shares, visualizes the controlled retraining lineage, and allows one-click generation of retraining candidates from alertable drift events without bypassing human approval gates.

---

## C. Implementation Summary

### Components Created
- `frontend-react/src/pages/Monitoring.tsx`: Complete monitoring and drift intelligence interface comprising:
  - **Monitoring KPI Overview:** Top-level metrics cards presenting Total Window Evaluations, Alertable Drift Events (with alert badges), Stable/Clean Windows, Monitored Deployment Slots, Drift Alert Rate (% of windows exceeding threshold), and Drift Threshold rule notice ($\ge 50\%$ feature drift share or dataset drift flag).
  - **Controlled Automation Retraining Architecture Banner:** Visual workflow explainer detailing the 5-step lineage from Drift Snapshot $\rightarrow$ Candidate Generation $\rightarrow$ Champion Gate $\rightarrow$ Human Sign-off $\rightarrow$ Staging/Production Promotion.
  - **Drift Evaluation History Table:** Searchable and filterable snapshot history displaying Snapshot ID, Deployment / Model Name & Version tag, Drift Status badge (Alertable Drift: Red, Drift Detected: Amber, Stable/Clean: Green, Error: Slate), visual Drift Share percentage progress bar, Inference Window Rows count, Evaluation Timestamp, Retraining Pipeline status / quick action, and Inspect action.
  - **Evaluate Drift Window Modal:** Dedicated upload and execution interface allowing users to select an active deployment slot, drag-and-drop or browse for an inference window CSV file, validate inputs, execute drift evaluation via `POST /api/v1/deployments/{id}/monitor`, view immediate evaluation outcomes (drift share, dataset drift verdict, alert status), and inspect details or generate retraining candidates directly.
  - **Snapshot Inspection Modal:** In-depth inspection modal displaying dataset drift metrics, feature drift share bar, inference sample counts, alert threshold analysis, target deployment metadata, error messages, and feature-level drift report visualization.
  - **Transparent Engineering Notice for Feature-Level Distributions:** Explicit architectural disclosure communicating that per-column statistical metrics (Wasserstein distance, KS test) and distribution histograms are stored in PostgreSQL (`monitoring_snapshots.report` JSON column), while the current REST API response schema serializes dataset-level aggregate indicators (`drift_detected`, `drift_share`, `n_rows`, `alert`).
  - **Drift-to-Retraining Pipeline Actions:** Contextual candidate status inspection, linking directly to `/pipelines`, or enabling alertable snapshots to generate a retraining candidate with instant feedback.

### Components Modified
- `frontend-react/src/api/types.ts`:
  - Added `MonitoringSnapshotResponse` interface covering `id`, `deployment_id`, `drift_type`, `n_rows`, `drift_detected`, `drift_share`, `status`, `error_message`, `created_at`, `alert`, and optional `report`.
- `frontend-react/src/api/client.ts`:
  - Added `listMonitoringSnapshots(deploymentId)`: `GET /api/v1/deployments/{id}/monitoring`
  - Added `runMonitoring(deploymentId, form)`: `POST /api/v1/deployments/{id}/monitor` (multipart CSV upload)
  - Added `generateCandidateFromSnapshot(snapshotId)`: `POST /api/v1/retraining/from-snapshot/{id}`
- `frontend-react/src/App.tsx`:
  - Replaced `<ComingSoon title="Monitoring" phase="Phase 3" />` with `<Monitoring />` mounted at `/monitoring`.

### Backend APIs Integrated
- `GET /api/v1/deployments`: Discovers all deployed model slots.
- `GET /api/v1/deployments/{id}/monitoring`: Retrieves historical monitoring snapshots for a deployment.
- `POST /api/v1/deployments/{id}/monitor`: Uploads inference window CSV and runs Evidently `DataDriftPreset` against original training data.
- `GET /api/v1/registry`: Retrieves model version metadata for cross-referencing model names and version tags.
- `GET /api/v1/retraining`: Retrieves retraining candidates to link monitoring snapshots with downstream candidate jobs and evaluations.
- `POST /api/v1/retraining/from-snapshot/{snapshot_id}`: Triggers idempotent retraining candidate generation for alertable snapshots.

### Services Reused
- `api.monitoring_service`: Evidently drift evaluation engine, snapshot database persistence, and threshold calculation (`is_alertable`).
- `api.retraining_service`: Candidate generation from drift signal, idempotency enforcement, and candidate lifecycle management.
- `api.routers.deployments`: Multipart CSV parsing and dataset validation.

### User Workflows Implemented
1. **Drift Evaluation Execution:** User selects an active deployment, provides an inference window CSV matching the model features, and submits for drift computation against the model's reference training dataset.
2. **Observability & History Inspection:** Comprehensive visibility across all monitored deployments, with search by snapshot ID or deployment name, and filter pills by drift severity (`Alertable`, `Stable/Clean`, `Error`).
3. **Drift-to-Retraining Candidate Generation:** When an inference window triggers an alert ($\ge 50\%$ drifted features or dataset drift verdict), the user can generate a retraining candidate directly from the table or inspection modal.
4. **Idempotency & Retraining Linkage:** If a candidate has already been generated from a snapshot, the UI displays its lifecycle status (`pending`, `evaluated`, `approved`, `rejected`) and provides one-click navigation to Retraining Pipelines (`/pipelines`).
5. **Gated Retraining Protection:** For non-alerting snapshots, the candidate generation action is disabled with an explanatory tooltip explaining threshold gating to prevent unnecessary retraining compute.

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
✓ 634 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/favicon-CEm-Kg_k.svg      0.43 kB │ gzip:   0.32 kB
dist/index.html                       0.47 kB │ gzip:   0.31 kB
dist/assets/index-DcS4IT7R.css       26.73 kB │ gzip:   5.55 kB
dist/assets/index-B4rKDT53.js     1,365.86 kB │ gzip: 430.56 kB
✓ built in 11.43s
```
Status: Passed with 0 errors.

### Targeted Backend Test Execution
Executed command:
```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_deployment_monitoring.py tests/test_retraining.py
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.3.3, pluggy-1.7.0
rootdir: C:\Users\Aditya\Desktop\MLForge-main\MLForge-main
configfile: pytest.ini
plugins: anyio-4.16.0, Faker-40.54.0
collected 38 items

tests\test_deployment_monitoring.py ................                     [ 42%]
tests\test_retraining.py ......................                          [100%]

====================== 38 passed, 21 warnings in 23.03s =======================
```
Status: All 38 tests passed.

### Full Pytest Regression Suite
Executed command:
```powershell
.\.venv\Scripts\python.exe -m pytest
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.3.3, pluggy-1.7.0
rootdir: C:\Users\Aditya\Desktop\MLForge-main\MLForge-main
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.16.0, Faker-40.54.0
collected 99 items

tests\test_api.py ........                                               [  8%]
tests\test_catalog.py ......                                             [ 14%]
tests\test_deployment_monitoring.py ................                     [ 30%]
tests\test_e2e_lifecycle.py .....                                        [ 35%]
tests\test_hardening.py ........................                         [ 59%]
tests\test_phase2.py ......                                              [ 65%]
tests\test_preprocessing.py ...                                          [ 68%]
tests\test_retraining.py ......................                          [ 90%]
tests\test_task_detection.py .....                                       [ 95%]
tests\test_training.py ....                                              [100%]

====================== 99 passed, 21 warnings in 38.33s =======================
```
Status: 100% passing across all 99 tests (0 failures).

---

## E. Schema & Contract Alignment
- Strictly adhered to `MonitoringSnapshotResponse` defined in `api/schemas.py`:
  - `id`: string
  - `deployment_id`: string
  - `drift_type`: string
  - `n_rows`: int
  - `drift_detected`: bool | null
  - `drift_share`: float | null
  - `status`: string ("ok" | "unavailable" | "error")
  - `error_message`: string | null
  - `created_at`: datetime
  - `alert`: bool
- Accurately communicated that while Evidently computes per-feature Wasserstein/KS metrics in the database JSON column (`report`), the current REST API response schema serializes dataset-level aggregate drift indicators. No mocked feature distributions were fabricated.

---

## F. Error Handling & Edge Cases
- **Missing or Incomplete Features:** CSV uploads missing columns required by the deployed model return descriptive error messages from `api/routers/deployments.py`, which are displayed directly in the upload modal.
- **Below-Threshold Protection:** Non-alertable snapshots disable the "Generate Retraining Candidate" button and explain the $\ge 50\%$ feature drift / dataset drift requirement.
- **Retraining Idempotency:** Subsequent candidate generation requests for the same snapshot gracefully return the existing candidate without duplicating pipeline jobs.
- **No Monitored Deployments State:** Clear empty state guidance inviting users to evaluate their first inference window.

---

## G. Visual & Design System Conformance
- Fully conforms to MLForge's dark slate theme (`bg-slate-900/60`, `border-slate-800`, `text-slate-100`).
- Reuses shared UI primitives: `Card`, `CardHeader`, `Icon`.
- Status indicators align with the established design system:
  - Alertable: Red badge with pulsating indicator (`bg-red-500/10 text-red-400 border border-red-500/20`).
  - Drift Detected (non-alerting): Amber badge (`bg-amber-500/10 text-amber-400 border border-amber-500/20`).
  - Stable / Clean: Emerald green badge (`bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`).

---

## H. Unfinished Items / Deliberate Exclusions
- Feature distribution histograms and per-column p-value tables are conditional upon `report` JSON being exposed by the REST API; the UI includes an honest architectural note rather than inventing mock column data.
- Explainability (`/explainability`) and Settings remain placeholder routes, reserved for Task 5B.5 and subsequent milestones.

---

## I. Security & Safety Compliance
- No git commits, merges, or branch changes were made.
- Authentication tokens (`X-API-Key`) are automatically propagated via `frontend-react/src/api/client.ts`.
- File uploads are validated server-side by `services.read_uploaded_csv`.

---

## J. Reviewer Sign-Off Criteria Checklist
- [x] `/monitoring` placeholder replaced with complete `Monitoring.tsx` interface.
- [x] Overview KPIs accurately computed from monitoring snapshot records.
- [x] Snapshot history table supports search, filtering, and inspection.
- [x] Inference window CSV upload triggers `POST /api/v1/deployments/{id}/monitor`.
- [x] Drift alert threshold ($\ge 50\%$ or dataset drift) clearly explained.
- [x] Candidate generation triggers `POST /api/v1/retraining/from-snapshot/{id}` for alertable snapshots.
- [x] Retraining lineage (Snapshot $\rightarrow$ Candidate $\rightarrow$ Gate $\rightarrow$ Human Decision $\rightarrow$ Promotion) clearly visualized.
- [x] Honest engineering disclosure regarding aggregate REST schema vs. database JSON.
- [x] TypeScript production build compiles with 0 errors.
- [x] All 99 backend pytest tests pass with 0 failures.

---

## K. Files Modified / Created
- `frontend-react/src/pages/Monitoring.tsx` (Created)
- `frontend-react/src/App.tsx` (Modified)
- `frontend-react/src/api/types.ts` (Modified)
- `frontend-react/src/api/client.ts` (Modified)
- `docs/handover/task-5b4-monitoring.md` (Created)

---

## L. Next Recommended Task
Task 5B.5 — Explainability Interface (`/explainability`) to expose SHAP global feature importances, per-model explanation status, and unsupported model guidance.
