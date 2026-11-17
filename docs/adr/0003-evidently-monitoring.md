# ADR-0003: Evidently for monitoring (data/prediction drift, labeled performance)

Status: **Proposed** (Phase 3)

## Context
No monitoring exists today. The transformation prompt requires distinguishing data drift, prediction drift, and measured model degradation (only computable once ground-truth labels arrive) without conflating them.

## Decision
Use Evidently to compute drift/quality reports server-side on a schedule or on-demand over stored prediction/feature snapshots. `MonitoringService` stores snapshot results (timestamp, dataset/window identifier, model version, drift scores, threshold breaches) in the application database; Evidently itself is not a system of record, it is a computation adapter invoked by the backend.

## Consequences
- Frontend never calls Evidently directly; it reads `MonitoringService` results through `/api/v1/monitoring`.
- Thresholds/alert rules are configuration owned by MLForge, not hardcoded in Evidently report defaults.
- Drift detection only ever creates an alert/candidate signal — it must never auto-trigger production promotion (see ADR-0005 / retraining guardrails).
