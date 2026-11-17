# ADR-0002: MLflow for experiment tracking

Status: **Proposed** (Phase 2)

## Context
There is currently no experiment tracking — training runs leave only a UUID-named CSV/pickle pair under `MLForge_files/`, with no parameters, no comparison, no lineage. The transformation prompt requires tracking every single-model and AutoML candidate run with full metadata and grouping AutoML candidates under a parent run.

## Decision
Use MLflow as the experiment-tracking system of record for runs, params, metrics, tags, and artifact lineage. The application database (Phase 1 SQLite → Phase 2 PostgreSQL) owns product authorization and workflow state (who can see/act on what); MLflow owns experiment tracking and artifact lineage. MLForge's own `Experiment`/`Run` rows store the MLflow run ID as a foreign key, not a duplicate of MLflow's metric/param data.

## Consequences
- The browser never talks to MLflow directly; all access goes through a FastAPI adapter (`ExperimentService` + MLflow client), consistent with the transformation prompt's integration rule.
- AutoML candidates are logged as child runs under one parent run ID per search request.
- Requires an MLflow tracking server (or local file-store backend for Phase 1/2 scale) — to be sized and decided with the user before Phase 2 implementation starts.
