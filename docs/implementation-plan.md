# MLForge — Implementation Plan

Baseline: see [`docs/architecture/current-state.md`](architecture/current-state.md). This plan follows the phase gates in the PRD (§20) and the MLOps/frontend extension in the master transformation prompt. Phases are sequential; a phase is not started until the prior phase's exit criteria pass and the user has approved moving forward.

## Phase 0 — Discovery and baseline (this delivery)
- Repository inventory, PRD-to-code audit, git safety report, risk register (current-state.md).
- UI asset inspection + visual spec (`docs/ui/visual-spec.md`).
- Proposed ADRs for React migration, MLflow, Evidently, registry ownership, storage/job queue.
- **Exit:** user reviews this findings set and explicitly approves Phase 1 scope before any code changes.

## Phase 1 — Core product correctness (PRD Phase 1 + UI shell)
Scope:
- Fix BUG-01..06.
- Delete `api/find-best-model.py` (dead code).
- Refactor `api/main.py` into routers (`datasets`, `training`, `health`) + a service layer (`DatasetService`, `TrainingService`, `SearchService`).
- Add a preprocessing step (imputation, categorical encoding, scaling) ahead of model fitting.
- Replace subprocess-per-model execution with in-process calls.
- Implement `/predict` (closes `use-model.html` gap) and `/jobs` (closes `logs.html` gap) end to end.
- Introduce SQLite metadata store + Alembic baseline migration.
- API key auth (FR-AUTH-01); CORS restricted from `*`; input/file validation; stack traces never returned to clients.
- Git hygiene: `.gitignore`, unstage/remove data+pickle files from the first commit (see current-state.md §5), first real commit on `feature/mlforge-mlops-foundation`.
- React + TypeScript + Vite frontend migration (ADR-0001), reproducing the existing workflows (train, find-best-model, results pages) plus the Overview screen matched to the supplied screenshot/SVG pack.
- Docker Compose for local/staging.
- pytest suite: unit (preprocessing, metrics, config), integration (SQLAlchemy), API (success/failure/auth paths).
- **Exit:** PRD §18 critical scenarios 1–2 pass; `GET /models` returns 200; no endpoint leaks a stack trace; no write endpoint reachable without an API key; CI green.

## Phase 2 — Multi-user & MLOps foundation
Scope:
- User accounts, ownership scoping (FR-AUTH-02/03).
- PostgreSQL migration (from the Phase 1 SQLite baseline, scripted and tested against a staging copy first).
- Redis + RQ async execution for training/search jobs.
- Retention/cleanup job for datasets and artifacts.
- MLflow experiment tracking: every run and AutoML candidate logged (params, metrics, tags, dataset fingerprint, git commit, dependency snapshot); AutoML candidates grouped under a parent run.
- Dataset quality/validation reports (profiling, leakage heuristics) surfaced before training.
- Model registry: versioned artifacts, lifecycle states (Development/Staging/Production/Archived), model cards, promotion approvals, rollback.
- SHAP explainability (global importance + local explanations where supported) and initial quality gates.
- **Exit:** two distinct users cannot see each other's resources (authorization test matrix); experiments are reproducible from logged metadata; model versions are traceable end to end; 20 concurrent `/find-best-model` requests complete without blocking the API process.

## Phase 3 — Deployment and monitoring
Scope:
- Real-time JSON prediction API + batch inference, served through FastAPI (no separate serving platform).
- Deployment lifecycle: health checks, request/latency/error capture, rollback to a prior approved version.
- Evidently monitoring: data quality, feature drift, prediction drift, labeled-performance drift — kept conceptually distinct, never conflated.
- Prometheus metrics + OpenTelemetry tracing + Grafana dashboards; health/readiness endpoints reporting real dependency state.
- Alerts/thresholds, champion/challenger comparison.
- **Exit:** a registered model can be deployed, monitored, evaluated and safely rolled back end to end.

## Phase 4 — Controlled automation (optional)
Scope: scheduled/drift-triggered candidate retraining (never auto-promotes), candidate-vs-champion evaluation, approval gates, full audit trail. Only started once Phases 1–3 are stable and the user opts in.

## Cross-cutting, applies to every phase
- Small Conventional-Commit-style commits on `feature/mlforge-mlops-foundation` (or a per-phase branch, to be confirmed with the user).
- Tests added with every behavior change, not deferred to phase-end.
- `docs/implementation-status.md` kept current as a requirement → code → test traceability table.
- New ideas outside the active phase go to `docs/backlog.md`, not into the active phase.
- Each phase ends with the reporting format defined in the transformation prompt (inspected / changed / requirements / files / migrations / API diff / UI fidelity / tests run / security notes / docs updated / git refs / limitations / exit-criteria checklist).

## Immediate next step
This plan stops at the end of Phase 0. **Phase 1 does not start until the user confirms:** (a) the git-safety remediation in current-state.md §5, and (b) the React/Vite migration and phase scope above.
