# MLForge — Implementation Status (Requirement Traceability)

Status values: `Not started` · `Partially implemented` · `Implemented` · `Tested` · `Documented` · `Deferred` · `Blocked`.

**Update (Phase 2 verification gate + Phase 3):** a real Python 3.12 + Node.js environment is now available (installed via winget partway through this engagement). As of this update, `pytest` has actually been run (**71 passed, 0 failed**, covering Phases 1/2/the hardening pass/Phase 3), `alembic upgrade head` has been run against a fresh SQLite database (`0001→0002→0003→0004`, including a downgrade/re-upgrade of 0004), and `npm run build` has been run for the frontend (passes). Two real defects were found and fixed this way (see the hardening section below) that inspection alone had missed. Everything below that still says "written, not run" predates this — the caveat paragraph is kept for historical accuracy, but check each row's own evidence column for whether it's since been exercised.

**Original caveat (Phases 1–2, pre-verification):** the environment this work was originally written in had no working Python or Node.js interpreter. Nothing was executed — not the pytest suite, not a manual `uvicorn`/API smoke test, not `npm install`/`npm run build`. Everything marked `Partially implemented` meant "written, internally consistent on inspection, not run."

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
| FR-AUTH-01 (API key) | PRD §8 | `api/deps.py` (`API_KEY`), `api/auth.py::SystemPrincipal`/`require_auth_if_configured` | `tests/test_api.py::test_write_endpoints_require_api_key_when_configured` (written, not run) | Partially implemented | 1 |
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

## Phase 2 (in progress, same "written not executed" caveat as above)

| Requirement ID | Implementation location | Status |
|---|---|---|
| FR-AUTH-02/03 (user accounts, ownership scoping) | `api/auth.py`, `api/routers/auth.py`, `Job.owner_id`, `services.owns()` | Partially implemented -- no frontend login UI yet; backend-only |
| MLOPS-EXP-01 (MLflow tracking) | `api/integrations/mlflow_adapter.py`, wired into `services.run_train_job`/`run_find_best_job` | Partially implemented -- degrades to a no-op if `mlflow` isn't actually installed (not verifiable here); AutoML candidates logged as nested runs under a parent |
| Dataset quality/validation | `ml_core/dataset_profile.py`, `POST /api/v1/datasets/profile` | Partially implemented -- profiling + heuristic leakage/imbalance warnings only, no UI page yet (Datasets nav item is still ComingSoon in the frontend) |
| MLOPS-REG-01 (model registry) | `api/registry_service.py`, `api/routers/registry.py`, `ModelVersion` | Partially implemented -- register/list/promote/rollback + a configurable quality gate (`MLFORGE_PROMOTION_MIN_SCORE`); no frontend page yet |
| MLOPS-XAI-01 (SHAP explainability) | `ml_core/explainability.py`, `GET /api/v1/jobs/{id}/explain` | Partially implemented -- global feature importance only, no local/per-prediction explanations yet; degrades to a clean "unsupported" response if `shap` isn't installed or the estimator isn't supported |
| PostgreSQL migration | n/a | **Not started** -- still SQLite; `DATABASE_URL` is already abstracted (`api/db.py`) so this is a connection-string + testing exercise, not a rewrite, when picked up |
| Redis + RQ async execution | n/a | **Not started** -- training/search are still synchronous within the request; this is the main Phase 2 item not attempted this pass |
| Retention/cleanup job | n/a | **Not started** |
| Rate limiting | n/a | **Not started** |

## Phase 2 Hardening pass (`feature/phase2-hardening`, same "written not executed" caveat)

| Area | What changed | Status |
|---|---|---|
| Registry ownership isolation | `api/registry_service.py`: production lookup, version numbering, and rollback target all scoped by `owner_id` (`_owner_filter`); `register_version` defense-in-depth re-checks `job.owner_id == owner_id`; lifecycle transitions restricted to a defined graph (`_ALLOWED_TRANSITIONS`); `promote`/`rollback` wrap their commits in try/except + `db.rollback()` | Partially implemented -- see `tests/test_hardening.py` (cross-user promotion/rollback/version-numbering tests), written not executed |
| Access token security | `api/db_models.py::AccessToken` rebuilt: `token_hash` (SHA-256) replaces the raw token as storage, `expires_at` (default 30d, `MLFORGE_TOKEN_TTL_DAYS`), `revoked_at`; `POST /auth/logout` revokes; `alembic/versions/0003` migration (breaking: invalidates all existing sessions, documented as intentional) | Partially implemented |
| Auth bypass / dev vs. production | `api/deps.py::ENVIRONMENT`/`IS_PRODUCTION` (`MLFORGE_ENV`); `require_auth_if_configured` never applies the local-dev bypass when `IS_PRODUCTION` is true, regardless of whether any user exists | Partially implemented |
| API information disclosure | `pickle_path` removed from `JobDetail`; `run_predict_job`/`explain` no longer return raw exception text (logged server-side via `logger.exception`, generic message to the client) | Implemented (by inspection; not executed) |
| MLflow reliability | `api/integrations/mlflow_adapter.py` rewritten: `tracked_run()` no longer conflates "MLflow failed to start/end" with "the caller's training code raised" (the latter always propagates, uncaught); every adapter call site guarded individually; `Job.tracking_status` (`ok`/`unavailable`/`error`) records what actually happened instead of assuming success | Partially implemented |
| Repo hygiene | `git rm --cached` on `MLForge_files/api_uploads/` (73 files) and `MLForge_files/pickle_files/` (69 files) -- generated runtime artifacts, inspected and found to be a public Kaggle HR-attrition dataset + synthetic attendance data, no real PII, untracked regardless on principle. Fixed a `.gitignore` gap (`text_classifier_training_output/`, actual tracked path, was never covered by the old `training_output/` pattern). **Un-ignored** `bulk_upload_folder/`, `rawTraining/`, `MLForge_execution_groups/` -- Phase 1 had wrongly `.gitignore`'d these; they are legitimate sample datasets per the Phase 0/1 correction, not generated output. Git history still contains the untracked files from before this engagement (see below) | Implemented (untracking done; history rewrite still a separate, unapproved decision) |
| Model registry reliability (lifecycle) | Covered above (ownership isolation) plus: only `development→{staging,archived}`, `staging→{production,development,archived}`, `production→archived`, `archived→staging` transitions are allowed; a DB-level `UniqueConstraint(owner_id, model_name, version)` backs the application-level counting | Partially implemented |
| SHAP / dataset profiling hardening | `ml_core/explainability.py`: empty/invalid input rejected up front, SHAP output shape validated against feature count before zipping (previously a silent-truncation risk). `ml_core/dataset_profile.py`: defensive `.copy()` so profiling can never mutate the caller's dataframe | Partially implemented |
| Test suite expansion | `tests/test_hardening.py` (new, ~25 tests): auth (duplicate registration, logout/revocation, expiry, prod-vs-dev bypass), ownership (predict/registry/promote/rollback cross-user denial, per-owner version numbering), MLflow (adapter failure doesn't fail training, both "not installed" and "raises" paths), registry (invalid transitions, quality gate, production replacement, rollback), dataset profiling (missing values, duplicates, constant columns, imbalance, regression, leakage, non-mutation), explainability (unsupported model, empty input, missing-shap degrade), API (no `pickle_path` leak). `tests/test_phase2.py` updated for the new staging-gated promotion flow | Written, **not executed** |

### Not addressed in this hardening pass
- PostgreSQL migration, Redis+RQ async execution, retention/cleanup, rate limiting -- unchanged from the Phase 2 feature pass, still not started.
- Git history still contains the pre-engagement commit of `api_uploads/`/`pickle_files/` -- untracking only prevents new commits; purging history requires a force-push and is a separate decision for the user (same as the Phase 0 finding).
- No automatic migration runner on startup (`init_db()` uses `Base.metadata.create_all`, which creates missing tables but does not alter existing ones) -- an existing Phase 1-schema SQLite file would need `alembic upgrade head` run explicitly before this code can use it safely. Not auto-run, by design (never touch a real user database without being asked).
- Token rotation / refresh tokens, rate limiting on login attempts, and account lockout are not implemented.

## Phase 2 verification gate (`feature/phase2-hardening`, executed for real)

With a real interpreter installed: **pytest 55/55 passed**, Alembic `0001→0003` clean on a fresh SQLite DB, the two-users-same-model-name registry ownership isolation tests passed, and `npm run build` passed. Two real defects were found and fixed:
- `api/auth.py`: `AccessToken.expires_at` round-trips through SQLite as a naive datetime even on a `DateTime(timezone=True)` column; comparing it to an aware `datetime.now(timezone.utc)` raised `TypeError` on every authenticated request. Fixed by normalizing to UTC-aware before comparing.
- `alembic/versions/0002`: `batch_alter_table("jobs").add_column()` with an inline, unnamed `ForeignKey` fails under SQLite's recreate-table batch mode. Named it explicitly.

## Phase 3 — Deployment and monitoring (`feature/phase3-deployment-monitoring`)

| Requirement ID | Implementation location | Test/evidence | Status |
|---|---|---|---|
| Real-time JSON prediction | `api/routers/deployments.py::predict_json`, `Deployment`/`RequestLog` tables | `tests/test_deployment_monitoring.py` (success, missing-field, inactive-deployment cases) -- **71/71 passed** | Implemented, tested |
| Deployment lifecycle (deploy/rollback/stop, ownership-scoped) | `api/deployment_service.py` -- only `staging`/`production` versions deployable; deploying replaces the prior active deployment for that owner+model_name slot, same pattern as registry promote/rollback | `test_deploy_and_metrics`, `test_deploying_new_version_replaces_old_and_rollback_restores_it`, `test_user_cannot_deploy_or_control_another_users_resources` -- passed | Implemented, tested |
| Request count/latency/error capture | `api/deployment_service.py::log_request`/`deployment_metrics`, `RequestLog` table | Covered by the real-time-predict tests above | Implemented, tested |
| Evidently data-drift monitoring | `api/integrations/evidently_adapter.py` (graceful-degrade, same contract as the MLflow adapter), `api/monitoring_service.py`, `MonitoringSnapshot` table | `test_monitoring_identical_distribution_...`, `test_monitoring_shifted_distribution_is_flagged_when_evidently_available`, `test_monitoring_history_is_listed`, `test_monitoring_rejects_window_missing_required_columns` -- passed (evidently is actually installed in this environment, so these exercised the real drift computation, not just the degrade path) | Implemented, tested |
| Alert thresholding | `api/monitoring_service.py::is_alertable` (`MLFORGE_DRIFT_ALERT_SHARE`) | Covered by the shifted-distribution test above | Implemented, tested |
| Champion/challenger comparison | `GET /api/v1/registry/compare` | `test_champion_challenger_compare_with_no_champion_yet`, `test_champion_challenger_compare_with_existing_champion`, `test_cannot_compare_another_users_challenger` -- passed | Implemented, tested |
| Prometheus metrics | `api/integrations/prometheus_metrics.py`, `GET /metrics` | `test_metrics_endpoint_is_reachable_without_auth`, `test_metrics_endpoint_reflects_request_counts` -- passed | Implemented, tested |
| OpenTelemetry tracing | n/a | **Not started** -- deferred: meaningful verification needs an external collector this sandbox can't stand up; see `docs/backlog.md` | Not started |
| Grafana dashboards | n/a | **Not started** -- same reason; `/metrics` is scrape-ready for Prometheus, but no dashboard JSON was authored since there's nothing to render it against here | Not started |
| Batch inference enhancements beyond existing `/predict` | n/a | **Not started** | Not started |

## Known gaps / deferred within Phase 1
- `src/model.py`/`train.py`/`test.py`/`metrics.py` are superseded by `ml_core/` but not deleted yet (kept pending the user's own verification, per the transformation prompt's "don't delete legacy code until tested" rule).
- Legacy static `frontend/` is kept until the React app's parity checklist (`docs/ui/visual-spec.md` §9) is actually run in a browser.
- TanStack Query/Table, shadcn/ui, React Hook Form + Zod, Zustand (ADR-0001's full stack) are not yet wired in — the four functional pages use plain `fetch`/`useState`, which is enough for this phase's scope (4 forms, 1 table) but should be revisited before Phase 2 adds more screens.
- No stratified-split enforcement test, no performance/load test, no security test suite yet (all PRD §18 tiers beyond unit/API are outstanding).
- Dataset profiling/validation UI (FR-DATA-02..04) is not built; only upload validation exists.
