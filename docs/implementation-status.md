# MLForge — Implementation Status (Requirement Traceability)

Status values: `Not started` · `Partially implemented` · `Implemented` · `Tested` · `Documented` · `Deferred` · `Blocked`.

**Important caveat on this update:** the environment this Phase 1 work was written in has no working Python or Node.js interpreter (only Windows Store app-alias stubs). Nothing below has been executed — not the pytest suite, not a manual `uvicorn`/API smoke test, not `npm install`/`npm run build`. Everything marked `Partially implemented` here means "written, internally consistent on inspection, not run." Do not treat anything as `Tested` until you've actually run `pytest` and exercised the API/frontend yourself and reported back.

| Requirement ID | Source | Implementation location | Test/evidence | Status | Phase |
|---|---|---|---|---|---|
| BUG-01 (catalog path) | PRD §6.2 | `ml_core/catalog.py` | `tests/test_catalog.py`, `tests/test_api.py::test_get_models_returns_catalog` (written, not run) | Partially implemented | 1 |
| BUG-02 (dead code) | PRD §6.2 | deleted `api/find-best-model.py` | n/a (removal) | Implemented | 1 |
| BUG-03 (task detection) | PRD §6.2 | `ml_core/task_detection.py` | `tests/test_task_detection.py` (written, not run) | Partially implemented | 1 |
| BUG-04 (model_params parsing) | PRD §6.2 | `api/routers/training.py` (`json.loads`) | covered implicitly by `tests/test_api.py` train tests | Partially implemented | 1 |
| BUG-05 (stack traces leaked) | PRD §6.2 | `api/services.py::run_train_job` catches broadly, returns safe message | `tests/test_api.py::test_train_model_success_and_no_stack_trace_on_bad_column` (written, not run) | Partially implemented | 1 |
| BUG-06 (no column validation) | PRD §6.2 | `ml_core/training.py::validate_columns` | same test as BUG-05 | Partially implemented | 1 |
| FR-DATA (upload/validate) | PRD §8 | `api/services.py::read_uploaded_csv` (extension/size/parse validation only — no profiling/leakage UI yet) | none run | Partially implemented | 1 |
| FR-PREP (preprocessing pipeline) | PRD §8 | `ml_core/preprocessing.py` | `tests/test_preprocessing.py` (written, not run) | Partially implemented | 1 |
| FR-TRAIN (single-model training, in-process) | PRD §8 | `ml_core/training.py`, `api/routers/training.py` | `tests/test_training.py`, `tests/test_api.py` (written, not run) | Partially implemented | 1 |
| FR-FIND (AutoML search, in-process) | PRD §8 | `api/services.py::run_find_best_job` | none run | Partially implemented | 1 |
| FR-PREDICT (use trained model) | PRD §8 | `ml_core/prediction.py`, `api/routers/predict.py` | `tests/test_api.py::test_predict_uses_trained_job` (written, not run) | Partially implemented | 1 |
| FR-LOG (training history) | PRD §8 | `api/db_models.py::Job`, `api/routers/jobs.py` | `tests/test_api.py::test_jobs_endpoint_lists_completed_runs` (written, not run) | Partially implemented | 1 |
| FR-AUTH-01 (API key) | PRD §8 | `api/deps.py::require_api_key` | `tests/test_api.py::test_write_endpoints_require_api_key_when_configured` (written, not run) | Partially implemented | 1 |
| SQLite metadata store + Alembic | Transformation prompt | `api/db.py`, `alembic/versions/0001_initial.py` | none run | Partially implemented | 1 |
| Docker Compose | Transformation prompt | `Dockerfile`, `frontend-react/Dockerfile`, `docker-compose.yml` | not built/run | Partially implemented | 1 |
| UI-REF-01 (Overview screen 1:1 match) | Screenshot + SVG ZIP | `frontend-react/src/pages/Overview.tsx` + layout components | no browser screenshot comparison run (no Node available) | Partially implemented | 1 |
| React/TS/Vite migration | ADR-0001 | `frontend-react/` | `npm install`/build not run; TanStack Query/Table, shadcn, RHF+Zod, Zustand from the ADR's stack are **not yet adopted** (scope-reduced this phase, plain fetch + useState used instead — see implementation-plan follow-up note) | Partially implemented | 1 |
| GOV-VERSION-01 (git/versioning discipline) | Transformation prompt | `.gitignore`, `feature/mlforge-mlops-foundation` branch | History already contains committed+pushed data/pickle files from before this engagement; purge is a separate decision, not yet made | Blocked on user decision | All |
| MLOPS-EXP-01 (MLflow tracking) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-REG-01 (model registry) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-MON-01 (Evidently monitoring) | Transformation prompt | n/a | none | Not started | 3 |
| MLOPS-XAI-01 (SHAP explainability) | Transformation prompt | n/a | none | Not started | 2 |
| MLOPS-DEPLOY-01 (serving/rollback) | Transformation prompt | n/a | none | Not started | 3 |
| MLOPS-RETRAIN-01 (controlled retraining) | Transformation prompt | n/a | none | Not started | 4 (optional) |

## Known gaps / deferred within Phase 1
- `src/model.py`/`train.py`/`test.py`/`metrics.py` are superseded by `ml_core/` but not deleted yet (kept pending the user's own verification, per the transformation prompt's "don't delete legacy code until tested" rule).
- Legacy static `frontend/` is kept until the React app's parity checklist (`docs/ui/visual-spec.md` §9) is actually run in a browser.
- TanStack Query/Table, shadcn/ui, React Hook Form + Zod, Zustand (ADR-0001's full stack) are not yet wired in — the four functional pages use plain `fetch`/`useState`, which is enough for this phase's scope (4 forms, 1 table) but should be revisited before Phase 2 adds more screens.
- No stratified-split enforcement test, no performance/load test, no security test suite yet (all PRD §18 tiers beyond unit/API are outstanding).
- Dataset profiling/validation UI (FR-DATA-02..04) is not built; only upload validation exists.
