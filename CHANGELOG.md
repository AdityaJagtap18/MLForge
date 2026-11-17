# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Phase 1 (in progress)

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
