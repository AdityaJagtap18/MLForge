# MLForge

A self-service tabular ML platform: CSV upload → preprocessing → training/AutoML search → prediction → (Phase 2+) experiment tracking, model registry, deployment and monitoring. See [`PRODUCT_REQUIREMENTS_DOCUMENT.md`](PRODUCT_REQUIREMENTS_DOCUMENT.md) for the full product spec and [`docs/implementation-plan.md`](docs/implementation-plan.md) for the phased build-out this repo is following.

> **Status:** Phase 2 in progress. Phase 1's training/search/predict/logs flows plus Phase 2's user accounts, MLflow tracking, dataset profiling, model registry and SHAP explainability are written; Postgres/Redis+RQ/retention are not started and Evidently/deployment (Phase 3) aren't either — see [`docs/implementation-status.md`](docs/implementation-status.md). **Nothing in this repo has been executed by the assistant session that wrote it** (no Python/Node available) — run the test suite yourself before trusting it.

## Project structure

```
api/            FastAPI app: routers, services, DB models, schemas
ml_core/        Catalog, preprocessing, training, metrics, prediction (in-process, no subprocess)
alembic/        Database migrations
frontend-react/ React + TypeScript + Vite frontend (replaces the legacy static frontend, see docs/adr/0001)
frontend/       Legacy static HTML/JS frontend, kept until the React app reaches full parity (docs/adr/0001)
src/            Legacy CLI training scripts, superseded by ml_core/ -- kept pending verification, not yet deleted
tests/          pytest suite (unit + API)
docs/           Architecture, ADRs, UI spec, implementation plan/status, backlog
MLForge_files/  Runtime data: catalog CSVs (committed), uploads/pickles/db (gitignored, see .gitignore)
```

## Backend setup

Requires Python 3.12 (this repo was authored without a local Python available to the assistant session that wrote it — **the commands below have not been executed; please run and report back if anything fails**).

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

Environment variables (see `.env.example`):
- `MLFORGE_API_KEY` — required in any non-local deployment; write endpoints are unauthenticated if unset (a startup warning is logged).
- `MLFORGE_CORS_ORIGINS` — comma-separated allowed origins; defaults to the Vite dev server.
- `MLFORGE_DATABASE_URL` — defaults to a local SQLite file under `MLForge_files/`.
- `MLFORGE_FILES_DIR` — defaults to `./MLForge_files`.
- `MLFORGE_MLFLOW_ENABLED` — set to `false` to disable MLflow tracking entirely; defaults on but degrades to a no-op if `mlflow` isn't installed/reachable.
- `MLFLOW_TRACKING_URI` — defaults to a local file store under `MLForge_files/mlruns`.
- `MLFORGE_PROMOTION_MIN_SCORE` — minimum f1/r2 required to promote a model version to `production`; defaults to `0.0` (no gate — not the recommended production setting).

Run the API:

```bash
uvicorn api.main:app --reload
```

Docs at `http://127.0.0.1:8000/docs`. Versioned routes under `/api/v1`; the two original unversioned routes (`/models`, `/train-model`) are kept as deprecated aliases for one release (see `docs/adr/0005`).

Run tests:

```bash
pytest
```

## Frontend setup

```bash
cd frontend-react
npm install
cp .env.example .env   # set VITE_API_BASE_URL / VITE_API_KEY
npm run dev
```

Opens at `http://localhost:5173`.

## Docker Compose (local/staging)

```bash
cp .env.example .env   # set MLFORGE_API_KEY
docker compose up --build
```

## What changed from the original brownfield app

See [`docs/architecture/current-state.md`](docs/architecture/current-state.md) for the full audit. In short: BUG-01 through BUG-06 are fixed, `api/find-best-model.py` dead code is removed, training moved from subprocess-per-model to in-process calls behind a service layer, a preprocessing pipeline was added ahead of model fitting, a SQLite job-metadata store (via SQLAlchemy/Alembic) replaced the flat-file-only state, `/predict` and `/jobs` close the two biggest UI-promised-but-never-built gaps, and the frontend is migrating to React + TypeScript + Vite (`docs/adr/0001`).

## License

Provided as-is for educational and development purposes.
