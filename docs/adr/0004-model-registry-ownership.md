# ADR-0004: Model registry lifecycle ownership

Status: **Proposed** (Phase 2)

## Context
Both MLflow and a product database could plausibly "own" model versioning. The transformation prompt requires exactly one documented authoritative lifecycle model and forbids duplicate sources of truth between MLflow and the application database.

## Decision
The **application database** is authoritative for model lifecycle state (Development / Staging / Production·Champion / Archived·Retired), promotion approvals, champion/challenger comparisons, and rollback history — this is product workflow state, not experiment metadata. MLflow Model Registry (if used) or MLflow's artifact store supplies the underlying versioned artifact and its originating run; MLForge's `RegistryService` references that artifact by run ID + artifact checksum rather than re-implementing artifact storage.

## Consequences
- Promotion/rollback endpoints only ever write to the application database; they never mutate MLflow's own registry state directly, avoiding two systems disagreeing about "what's in production."
- Model cards are generated and stored by MLForge (model name/version, source run, dataset fingerprint, metrics, parameters, dependency snapshot), using MLflow run metadata as input, not as the card's storage location.
- Quality gates (Phase 2) are enforced by `RegistryService` before a promotion is allowed to persist.
