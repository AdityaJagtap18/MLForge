"""Evidently adapter (docs/adr/0003). Computes data-drift reports for
MonitoringService; never touched directly by the frontend. Same
reliability contract as api/integrations/mlflow_adapter.py: a drift check
must never crash the request it's called from, and must never claim
success when it didn't actually run -- status is one of "ok" (evidently
ran and produced a result), "unavailable" (not installed), or "error"
(installed but the report itself failed, e.g. incompatible data shapes).
"""
from __future__ import annotations

import logging

import pandas as pd

logger = logging.getLogger("mlforge.evidently")


class DriftResult:
    def __init__(self, status: str, drift_detected: bool | None = None, drift_share: float | None = None, report: dict | None = None, error_message: str | None = None):
        self.status = status
        self.drift_detected = drift_detected
        self.drift_share = drift_share
        self.report = report
        self.error_message = error_message


def compute_data_drift(reference: pd.DataFrame, current: pd.DataFrame, columns: list[str]) -> DriftResult:
    """Data drift only -- whether the *input feature distributions* have
    shifted between `reference` (the original training data) and `current`
    (a new window). This is deliberately distinct from prediction drift or
    labeled-performance drift (transformation prompt: "do not conflate
    them") -- callers asking about those need a different computation, not
    this one reused."""
    try:
        from evidently.metric_preset import DataDriftPreset
        from evidently.report import Report
    except ImportError as exc:
        logger.warning("evidently is not installed -- drift check skipped: %s", exc)
        return DriftResult(status="unavailable", error_message="The evidently package is not installed on this server.")

    missing_ref = [c for c in columns if c not in reference.columns]
    missing_cur = [c for c in columns if c not in current.columns]
    if missing_ref or missing_cur:
        return DriftResult(
            status="error",
            error_message=f"Column(s) missing from reference{missing_ref} or current{missing_cur} data.",
        )

    try:
        report = Report(metrics=[DataDriftPreset()])
        report.run(reference_data=reference[columns], current_data=current[columns])
        result = report.as_dict()
        drift_metric = result["metrics"][0]["result"]
        return DriftResult(
            status="ok",
            drift_detected=bool(drift_metric.get("dataset_drift")),
            drift_share=float(drift_metric.get("share_of_drifted_columns", 0.0)),
            report=drift_metric,
        )
    except Exception as exc:
        logger.warning("Evidently drift report failed: %s", exc)
        return DriftResult(status="error", error_message=f"Drift report failed: {exc}"[:500])
