# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Phase 2 hardening pass (`feature/phase2-hardening`)

### Security
- Registry: production lookup, version numbering, and rollback target are now scoped per-owner (`api/registry_service.py`); previously a shared `model_name`-only lookup meant two users training identically-named models could archive/rollback each other's production version. Lifecycle transitions restricted to a defined graph (dev→staging→production→archived); promote/rollback wrapped in try/except + `db.rollback()`.
- Access tokens: now stored as SHA-256 hashes (`AccessToken.token_hash`), never the raw token; added `expires_at` (default 30 days) and `revoked_at` + `POST /auth/logout`. **Breaking**: `alembic/versions/0003` drops and recreates `access_tokens`, invalidating every existing session (there is no reversible path from the old plaintext-keyed schema).
- Auth bypass: added `MLFORGE_ENV` (development/production). The local-dev bypass now never applies in production, regardless of whether any user has registered yet.
- Removed `pickle_path` (an internal filesystem path) from `JobDetail`; prediction/explain failures no longer return raw exception text to callers (logged server-side instead).

### Reliability
- `api/integrations/mlflow_adapter.py` rewritten so a tracking-backend failure can never be confused with (or swallow) a real exception from the caller's own training code; every adapter call site is individually guarded; `Job.tracking_status` (`ok`/`unavailable`/`error`) now records what actually happened.
- `ml_core/explainability.py`: rejects empty/invalid input up front, validates SHAP output shape against feature count before mapping (previously a silent-mismatch risk).
- `ml_core/dataset_profile.py`: operates on a defensive copy, guaranteeing it never mutates the caller's dataframe.

### Repository hygiene
- Untracked `MLForge_files/api_uploads/` (73 files) and `pickle_files/` (69 files) from git — generated runtime artifacts (inspected: a public Kaggle HR-attrition dataset + synthetic attendance data, no real PII, untracked on principle regardless).
- Fixed a `.gitignore` gap (the actually-tracked `text_classifier_training_output/` was never covered by the old `training_output/` pattern) and **reverted** a Phase 1 mistake that had wrongly `.gitignore`'d the legitimate `bulk_upload_folder/`, `rawTraining/`, `MLForge_execution_groups/` sample datasets.
- Git history still contains the pre-engagement commit of the untracked files; purging it is a separate, unapproved decision (force-push implications) — see `docs/security/threat-model.md` and `docs/implementation-status.md`.

### Added
- `tests/test_hardening.py` — ~25 new tests across auth, ownership, MLflow degradation, registry lifecycle, dataset profiling, and explainability. Written, reviewed, **not executed** (no Python interpreter available in this sandbox).
- `docs/security/threat-model.md`, `docs/hardening-baseline.md`.

## [Unreleased] — Phase 2 (in progress)

### Added
- `api/auth.py`, `api/routers/auth.py`: user accounts (`POST /auth/register`, `/auth/login`), PBKDF2-SHA256 password hashing (stdlib only), opaque bearer tokens. `Job.owner_id` + `services.owns()` scope every job/version read to its owner; a legacy `MLFORGE_API_KEY` still works as a service-account bypass (`SystemPrincipal`).
- `api/integrations/mlflow_adapter.py`: experiment tracking wired into `run_train_job`/`run_find_best_job` (params, metrics, git commit, dataset fingerprint; AutoML candidates logged as nested runs under one parent). No-ops cleanly if `mlflow` isn't installed/reachable.
- `ml_core/dataset_profile.py`, `POST /api/v1/datasets/profile`: row/column counts, missingness, duplicates, constant columns, target distribution/class-imbalance ratio, heuristic leakage warnings (high correlation with target, excess duplicates).
- `api/registry_service.py`, `api/routers/registry.py`, `ModelVersion` table: register a completed job as a versioned model, promote through development/staging/production/archived with a configurable quality gate (`MLFORGE_PROMOTION_MIN_SCORE`), and roll back to the previously-promoted version.
- `ml_core/explainability.py`, `GET /api/v1/jobs/{id}/explain`: SHAP global feature importance, explicitly worded as "contribution, not causation"; degrades to a clean `supported: false` response instead of a 500 when `shap` is missing or the estimator isn't supported.
- `alembic/versions/0002_phase2_auth_registry.py`.

### Not done this pass (see docs/implementation-status.md)
- PostgreSQL migration, Redis+RQ async execution, retention/cleanup job, rate limiting.
- No frontend UI yet for accounts/registry/dataset-profiling/explainability -- backend-only.

## [Unreleased] — Phase 1

### Added
- `ml_core/` package: model catalog, task-type detection, preprocessing pipeline, in-process training, metrics, prediction.
- `api/db.py`, `api/db_models.py`: SQLAlchemy `Job` model + Alembic baseline migration (`alembic/versions/0001_initial.py`) replacing flat-file-only state.
- `/api/v1/predict` and `/api/v1/jobs` endpoints, closing the `use-model.html` and `logs.html` gaps.
- API key authentication (`MLFORGE_API_KEY`) on all write endpoints; CORS restricted from `allow_origins=["*"]`.
- `frontend-react/`: React + TypeScript + Vite app (Overview dashboard matched to the supplied reference, Train/Find-Best-Model/Predict/Logs pages wired to the new API). See `docs/adr/0001-react-frontend.md`.
- `.gitignore`, Dockerfile(s), `docker-compose.yml`, `requirements-dev.txt`, pytest suite under `tests/`.
- Phase 0 documentation set under `docs/` (implementation plan/status, current-state audit, UI visual spec, ADRs, backlog).

### Changed
- `GET /models` now reads `MLForge_files/csv_configurations/baml_model_tbl.csv` (the real catalog) instead of a nonexistent `MLForge_model_tbl.csv` path (BUG-01).
- Training execution moved from one `subprocess.run(["python3", "src/model.py", ...])` per model to in-process calls (`ml_core.training.train_one_model`).
- `model_params` is parsed as plain JSON instead of the `str.replace('$', '"')` workaround (BUG-04).
- Training/search inputs are validated against the uploaded CSV's actual columns before fitting (BUG-06); failures return a clean 400 with a user-safe message instead of a raw traceback (BUG-05).
- Task-type detection heuristic reworked to also catch high-cardinality-relative-to-row-count integer targets (BUG-03).
- `requirements.txt` pinned to specific versions; unused `matplotlib` dependency dropped.

### Removed
- `api/find-best-model.py` — dead, non-importable duplicate of `/find-best-model` logic (BUG-02).
- Open `/files` static mount over the entire `MLForge_files/` data directory (no artifact access control; superseded by the DB-backed `/jobs`/`/predict` flow).

### Security
- Artifacts (`.pkl`) are only ever loaded by a path read back from our own DB row, never from a user-supplied path.
- Upload validation: `.csv` extension required, size-limited, parsed before trusting.

### Corrected
- Phase 0's initial audit incorrectly flagged `MLForge_files/csv_configurations/baml_model_tbl.csv` and `MLForge_files/MLForge_execution_groups/*.csv` as unrelated leftover business data; both are legitimate (the real model catalog, and generic sample training datasets, respectively) — see `docs/architecture/current-state.md` §4.
