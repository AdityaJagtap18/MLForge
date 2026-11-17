"""MonitoringService (docs/adr/0003): persists drift evaluation windows
against a Deployment. Drift alone never changes a Deployment's or
ModelVersion's state -- it is a signal surfaced to a human, consistent with
the transformation prompt's "candidate/recommendation, not automatic
production replacement" rule (that rule is about retraining, Phase 4, but
the same restraint applies here: nothing in this module writes to
Deployment or ModelVersion).
"""
from __future__ import annotations

import os

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.integrations import evidently_adapter
from api.db_models import MonitoringSnapshot

_DRIFT_ALERT_SHARE = float(os.environ.get("MLFORGE_DRIFT_ALERT_SHARE", "0.5"))


def evaluate_data_drift(
    db: Session, deployment_id: str, reference: pd.DataFrame, current: pd.DataFrame, columns: list[str]
) -> MonitoringSnapshot:
    result = evidently_adapter.compute_data_drift(reference, current, columns)

    snapshot = MonitoringSnapshot(
        deployment_id=deployment_id,
        drift_type="data_drift",
        n_rows=len(current),
        drift_detected=result.drift_detected,
        drift_share=result.drift_share,
        report=result.report,
        status=result.status,
        error_message=result.error_message,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def is_alertable(snapshot: MonitoringSnapshot) -> bool:
    """Threshold check (transformation prompt "configure thresholds and
    alert rules") -- a snapshot is alert-worthy if evidently actually ran
    and flagged either its own dataset_drift verdict or a high share of
    drifted columns."""
    if snapshot.status != "ok":
        return False
    if snapshot.drift_detected:
        return True
    return (snapshot.drift_share or 0.0) >= _DRIFT_ALERT_SHARE


def list_snapshots(db: Session, deployment_id: str) -> list[MonitoringSnapshot]:
    stmt = select(MonitoringSnapshot).where(MonitoringSnapshot.deployment_id == deployment_id).order_by(
        MonitoringSnapshot.created_at.desc()
    )
    return db.execute(stmt).scalars().all()
