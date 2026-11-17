# Task Handover: 5B.5 — Model Explainability Interface

## A. Task Information
- **Task ID:** Task 5B.5
- **Task Name:** Model Explainability Interface
- **Implementation Date:** 2026-11-17
- **Git Branch:** `feature/phase5-portfolio-readiness`
- **HEAD Commit:** `3f81afd1c37b607a5a73d997b67636d9e2ef9241`
- **Completion Status:** Completed & Verified

---

## B. Objective
The objective of Task 5B.5 was to replace the placeholder `ComingSoon` component at `/explainability` with a complete, production-grade Model Explainability interface. The page integrates directly with MLForge’s SHAP-based explainability engine (`ml_core/explainability.py` and `api/routers/explain.py`, ADR-0004). It enables users to select trained and registered model artifacts, compute and inspect global feature importance via mean absolute SHAP values (`mean(|SHAP|)`), visualize feature contribution rankings through interactive horizontal bar charts and ranked tables, and review authoritative unsupported-model guidance for non-tree/linear algorithms without fabricating mock metrics.

---

## C. Implementation Summary

### Components Created
- `frontend-react/src/pages/Explainability.tsx`: Complete model explainability interface comprising:
  - **Explainability Overview KPIs:** Real-time counters displaying Total Eligible Models (completed training runs with model artifacts), SHAP Supported Models (tree-based and linear models verified), Unsupported Models (distance-based models like KNN), Data Unavailable Models (models where the original training dataset was removed), and Method & Scope notice (Global SHAP 100-sample mean absolute attribution).
  - **Model Version Selector & Stage Filters:** Multi-criteria selector allowing users to switch between registered model versions (`ModelVersion`) and completed training jobs (`JobSummary`), with filters for lifecycle stages (`Production`, `Staging`, `Development`, `Archived`) and real-time search by model name, algorithm, or job ID.
  - **Global SHAP Feature Importance Visualizer (Apache ECharts):** High-fidelity horizontal bar chart with dynamically computed bar heights, responsive margins, primary brand styling (`#E96B18` with rounded right corners), custom tooltips with mean absolute SHAP values and relative contribution percentages, and axis labels.
  - **Ranked Feature Importance Table:** Detailed tabular view presenting Rank (`#1`, `#2`, ...), Feature Name with prefix tags (`num` vs `cat`), Mean |SHAP| Value (formatted to 4 decimal places), Relative Contribution Percentage, and visual progress fill bars.
  - **View Mode Switcher:** Instant toggling between `Split View` (chart + table), `Chart Only`, and `Table Only`.
  - **Methodology & Causality Disclaimer Banner:** Prominent guidance card citing the backend contract message:
    `"Values are mean(|SHAP value|) per feature: how much each feature contributed to this model's predictions on a sample of the training data. This reflects the model's learned behavior, not a causal relationship in the real world."`
    It reinforces the fundamental MLOps distinction between empirical model contribution on sampled training rows and real-world causality.
  - **Unsupported Model Guidance Notice:** Architectural explanation triggered when an algorithm is not supported by SHAP out of the box (e.g. `KNeighborsClassifier` requiring model-agnostic kernel estimations). It surfaces the verified backend error message verbatim and provides actionable guidance with forward links to train alternative tree or linear models.
  - **Model & Explanation Metadata Inspection:** Detailed card presenting Estimator class, Explanation Method (`TreeExplainer` / `LinearExplainer`), Sub-sample size (`100 rows, random_state=42`), Features Processed, Training Dataset filename, and Job ID.

### Components Modified
- `frontend-react/src/api/types.ts`:
  - Added `ExplainResponse` interface covering `job_id`, `supported`, `message`, `feature_names`, and `global_importance` (dictionary of feature attributions).
- `frontend-react/src/api/client.ts`:
  - Added `explainJob(jobId)`: `GET /api/v1/jobs/{job_id}/explain`.
- `frontend-react/src/App.tsx`:
  - Replaced `<ComingSoon title="Explainability" phase="Phase 2" />` with `<Explainability />` mounted at `/explainability`.
- `frontend-react/src/pages/ModelRegistry.tsx`:
  - Added "Explain Model (SHAP)" action in the model details inspection modal, passing `versionId` and `jobId` via React Router `location.state`.
- `frontend-react/src/pages/TrainModel.tsx`:
  - Added "Explain (SHAP) &rarr;" forward link on completed training runs to guide users directly to feature explainability.

### Backend APIs Integrated
- `GET /api/v1/jobs/{job_id}/explain`: Evaluates SHAP global feature importances for a completed job using `ml_core.explainability.global_feature_importance`.
- `GET /api/v1/registry`: Retrieves registered model versions to populate model selection and lifecycle stage badges.
- `GET /api/v1/jobs`: Retrieves training job metadata to associate datasets and algorithms.

### Services Reused
- `ml_core.explainability`: SHAP `Explainer` wrapping fitted pipelines, sub-sampling to 100 rows for bounded computation latency, and multi-class dimension flattening.
- `api.routers.explain`: Job ownership enforcement, pipeline unpickling, and graceful degradation returning `supported=False` with descriptive exception messages.

### User Workflows Implemented
1. **Model Discovery & Selection:** Users select any registered model version or completed training job from a filtered dropdown, with route state pre-selection when navigating from Model Registry or Train Model.
2. **Global Feature Attribution Analysis:** When a supported model is selected, the UI computes (or loads from cache) the SHAP feature importances, rendering a sorted horizontal bar chart and ranking table.
3. **Causality vs. Contribution Guidance:** Clear visual prompts remind users that high SHAP values represent statistical model dependency, not real-world causation.
4. **Unsupported Algorithm Handling:** For models where SHAP cannot analyze the estimator out of the box (e.g. KNN), the UI presents clear educational reasons without failing or rendering fake charts, directing users to alternative algorithms.
5. **Cross-Page Workflow Continuity:** Users can navigate from Train Model $\to$ Registry $\to$ Explainability $\to$ Registry seamlessly with preserved context.

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
✓ 635 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/favicon-CEm-Kg_k.svg      0.43 kB │ gzip:   0.32 kB
dist/index.html                       0.47 kB │ gzip:   0.31 kB
dist/assets/index-DdF72z6n.css       28.28 kB │ gzip:   5.74 kB
dist/assets/index-COFRL_3C.js     1,394.49 kB │ gzip: 436.61 kB
✓ built in 10.44s
```
Status: **Passed cleanly with 0 errors.**

### Targeted Explainability Tests
Executed command:
```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_hardening.py -k "explain"
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.3.3, pluggy-1.7.0
rootdir: C:\Users\Aditya\Desktop\MLForge-main\MLForge-main
configfile: pytest.ini
plugins: anyio-4.16.0, Faker-40.54.0
collected 24 items / 21 deselected / 3 selected

tests\test_hardening.py ...                                              [100%]

================ 3 passed, 21 deselected, 21 warnings in 5.18s ================
```
Status: **All 3 targeted explainability tests passed.**

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

====================== 99 passed, 21 warnings in 40.79s =======================
```
Status: **100% passing across all 99 tests (0 failures).**

---

## E. Schema & Contract Alignment
- Strictly adhered to `ExplainResponse` defined in `api/schemas.py`:
  - `job_id`: string
  - `supported`: boolean
  - `message`: string | null
  - `feature_names`: string[] | null
  - `global_importance`: Record<string, number> | null
- No local prediction explanations, dependence plots, or force plots were invented or mocked.
- Features are sorted descending by mean absolute SHAP value as delivered by the backend.

---

## F. Error Handling & Edge Cases
- **Unsupported Estimators:** Evaluated gracefully through `ExplainResponse(supported=False, message=...)`, triggering `UnsupportedModelNotice` instead of crashing.
- **Missing Dataset:** Gracefully detected and reported when training CSV is no longer on disk.
- **Empty or Zero Importance:** Handled gracefully in chart and table without division by zero.
- **Dynamic Chart Scaling:** Chart height automatically expands up to 15 features to ensure feature labels remain readable.
- **Model Ownership:** All requests are scoped to the authenticated user's jobs and registry versions.

---

## G. Visual & Design System Conformance
- Fully conforms to MLForge’s warm light business-friendly theme (`bg-surface: #FFFFFF`, `bg-bg: #FAF8F5`, `border-line: #EAE4DC`, `text-ink: #242424`, `text-muted: #77716B`, `text-primary: #E96B18`).
- Uses existing `EChart` component wrapping Apache ECharts (ADR-0001).
- Avoids dark backgrounds, purple gradients, and generic AI styling.

---

## H. Unfinished Items / Deliberate Exclusions
- Local per-prediction explanations and SHAP force plots are documented future enhancements (Phase 6/PRD FR-EXP-LOCAL) and are deliberately not fabricated.
- Live Dashboard (`/`) and Settings (`/settings`) remain to be addressed in Tasks 5B.6 and 5B.7.

---

## I. Security & Safety Compliance
- No git commits, merges, or branch changes were executed.
- Unpickling occurs strictly in the backend service using existing paths.
- No raw filesystem paths or pickle paths are leaked to the client.

---

## J. Reviewer Sign-Off Criteria Checklist
- [x] `/explainability` placeholder replaced with complete `Explainability.tsx` interface.
- [x] Overview KPIs accurately computed from actual registry and job records.
- [x] Model selection supports registered versions and training jobs with route state support.
- [x] Global feature importance rendered via Apache ECharts horizontal bar chart.
- [x] Features sorted by mean absolute SHAP values with relative contribution percentages.
- [x] Causality vs. contribution distinction explicitly communicated.
- [x] Unsupported models (e.g. KNN) handled gracefully with verified backend messages.
- [x] Workflow continuity established between Training, Registry, and Explainability.
- [x] TypeScript production build compiles with 0 errors.
- [x] All 99 backend pytest tests pass with 0 failures.

---

## K. Files Modified / Created
- `frontend-react/src/pages/Explainability.tsx` (Created)
- `frontend-react/src/App.tsx` (Modified)
- `frontend-react/src/api/types.ts` (Modified)
- `frontend-react/src/api/client.ts` (Modified)
- `frontend-react/src/pages/ModelRegistry.tsx` (Modified)
- `frontend-react/src/pages/TrainModel.tsx` (Modified)
- `docs/handover/task-5b5-explainability.md` (Created)

---

## L. Next Recommended Task
Task 5B.6 — Live Operational Dashboard (`/overview`) to eliminate all static mock arrays and aggregate real database counts (models, experiments, deployments, drift alerts).
