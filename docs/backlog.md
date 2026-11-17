# MLForge — Backlog (deferred, out of active phase scope)

- Text classification module rebuild without the MySQL dependency (PRD Phase 3, scope TBD in a follow-on addendum).
- Optional hyperparameter search (`GridSearchCV`/`RandomizedSearchCV`) as an opt-in `/train-model` mode (PRD Phase 3).
- Scheduled/recurring retraining against a periodically-updating dataset source (PRD Phase 3 / transformation prompt Phase 4).
- Kubernetes, Kubeflow, Feast, Airflow, or any additional microservice split — not planned; would need a dedicated ADR with a demonstrated requirement.
- Deep learning / neural architecture search beyond existing `MLPClassifier`/`MLPRegressor` catalog entries.
- Multi-tenant organizations, billing, role hierarchies beyond job ownership.
- Disposition of `MLForge_files/csv_configurations/baml_model_tbl.csv` and `MLForge_execution_groups/*` (unrelated business data) — flagged for removal pending user confirmation (see `docs/architecture/current-state.md` §4, §7).
