# MLForge — Backlog (deferred, out of active phase scope)

- Text classification module rebuild without the MySQL dependency (PRD Phase 3, scope TBD in a follow-on addendum).
- Optional hyperparameter search (`GridSearchCV`/`RandomizedSearchCV`) as an opt-in `/train-model` mode (PRD Phase 3).
- Scheduled/recurring retraining against a periodically-updating dataset source (PRD Phase 3 / transformation prompt Phase 4).
- Kubernetes, Kubeflow, Feast, Airflow, or any additional microservice split — not planned; would need a dedicated ADR with a demonstrated requirement.
- Deep learning / neural architecture search beyond existing `MLPClassifier`/`MLPRegressor` catalog entries.
- Multi-tenant organizations, billing, role hierarchies beyond job ownership.
- ~~Disposition of `baml_model_tbl.csv`/`MLForge_execution_groups/*` as unrelated data~~ — corrected: `baml_model_tbl.csv` is the real model catalog (used to fix BUG-01) and `MLForge_execution_groups/*` are legitimate generic sample datasets. Neither is removed; both stay tracked in git (corrected again in the hardening pass — Phase 1 had wrongly `.gitignore`'d them).
- Rate limiting on login attempts / account lockout (no brute-force protection on `/auth/login` yet).
- Token rotation / refresh-token flow (tokens are valid for their full TTL or until explicit revocation).
- Purging `MLForge_files/api_uploads/`+`pickle_files/` from git **history** (not just the working tree) — untracked in the hardening pass, but the pre-engagement "Initial commit" still has them; a history rewrite needs the user's explicit go-ahead (force-push implications).
- ~~Running the real Alembic migration chain (0001→0003) against an actual SQLite file~~ — done; see `docs/implementation-status.md`'s "Phase 2 verification gate" section (`pytest` 55/55, migration clean, ownership-isolation tests passed, frontend build passed).
- OpenTelemetry tracing and Grafana dashboards (Phase 3 scope) — not started on this branch. Both need an external collector/Grafana server to verify meaningfully.
- Batch-inference enhancements beyond the existing CSV-based `/predict` (Phase 3 scope) — not started on this branch.
- PostgreSQL migration — not started.
- Redis + RQ async execution — not started.
- Retention and cleanup job for datasets/artifacts — not started.
- Rate limiting (API-wide, beyond login attempts above) — not started.
- Frontend UI for any backend capability added in the hardening pass (or later) — registry/deployment/monitoring screens do not exist yet.
