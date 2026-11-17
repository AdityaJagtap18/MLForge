# ADR-0005: Job execution model and deployment/serving approach

Status: **Proposed** (Phase 1 execution change; Phase 3 deployment/serving)

## Context
Today every training/search request spawns a synchronous OS subprocess per candidate model inside the HTTP request/response cycle, with no timeout or concurrency control (confirmed in `docs/architecture/current-state.md` §4). The transformation prompt requires long-running work to never block the FastAPI event loop, SQLite only for local MVP, PostgreSQL for multi-user, and Redis+RQ introduced "in the agreed scale phase" — not before a service-layer boundary exists.

## Decision
- **Phase 1**: replace subprocess invocation with in-process calls behind a `TrainingService`/`SearchService` boundary (function calls, no module-level mutable state, no subprocess spawn). Still synchronous within the request for Phase 1's single-operator scope, but now callable independent of the HTTP lifecycle — the precondition the PRD sets for Phase 2's async move.
- **Phase 2**: introduce Redis + RQ workers for async execution once the service boundary above exists; SQLite → PostgreSQL migration happens in the same phase, scripted and tested against a staging copy before cutover.
- **Phase 3**: models are served through FastAPI directly (no separate serving platform such as Seldon/KServe) for both batch and real-time JSON prediction; deployment records capture exact model version, preprocessing pipeline version, config revision, and health/latency/error metrics, with rollback to a previously approved version.

## Consequences
- No microservice split; this stays a modular monolith with routers/services/ML-core boundaries, per the transformation prompt's "smallest architecture that satisfies the requirement" rule.
- Storage abstraction (SQLite vs. PostgreSQL) must be explicit in code from Phase 1 onward so the Phase 2 migration doesn't require a rewrite, only a connection-string/migration change.
- Kubernetes/Kubeflow/Feast/Airflow/separate serving platforms remain explicitly out of scope unless a future ADR demonstrates a concrete requirement.
