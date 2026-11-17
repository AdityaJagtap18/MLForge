from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from api import monitoring_service
from api.db_models import Deployment, Job, ModelVersion, MonitoringSnapshot, RetrainingCandidate
from api.integrations import evidently_adapter, mlflow_adapter
from api.schemas import (
    DailyActivityPoint,
    DeploymentsOverview,
    DriftAlertItem,
    DriftAlertsOverview,
    ExperimentsOverview,
    JobSummary,
    ModelPerformancePoint,
    ModelsOverview,
    OverviewStatsResponse,
    SystemHealthOverview,
)
from ml_core import catalog


def get_overview_stats(db: Session, owner_id: str | None = None) -> OverviewStatsResponse:
    """Aggregates live operational metrics from authoritative PostgreSQL tables
    for the dashboard (/overview). Strictly reflects real database state:
    no mock arrays, no fabricated fallbacks."""

    # 1. Registered Models & Lifecycle Stages
    model_stmt = select(ModelVersion).order_by(ModelVersion.created_at.desc())
    if owner_id is not None:
        model_stmt = model_stmt.where(ModelVersion.owner_id == owner_id)
    versions = db.execute(model_stmt).scalars().all()

    by_stage = {"development": 0, "staging": 0, "production": 0, "archived": 0}
    prod_champion: str | None = None
    for v in versions:
        if v.lifecycle_state in by_stage:
            by_stage[v.lifecycle_state] += 1
        if v.lifecycle_state == "production" and prod_champion is None:
            prod_champion = f"{v.model_name} v{v.version}"

    models_overview = ModelsOverview(
        total_registered=len(versions),
        by_stage=by_stage,
        production_champion=prod_champion,
    )

    # 2. Experiments (Jobs)
    job_stmt = select(Job).where(Job.job_type.in_(["train", "find_best"])).order_by(Job.created_at.desc())
    if owner_id is not None:
        job_stmt = job_stmt.where(Job.owner_id == owner_id)
    jobs = db.execute(job_stmt).scalars().all()

    total_exp = len(jobs)
    active_exp = sum(1 for j in jobs if j.status in ("pending", "running"))
    succeeded_exp = sum(1 for j in jobs if j.status == "succeeded")
    failed_exp = sum(1 for j in jobs if j.status == "failed")
    unique_datasets = len({j.dataset_filename for j in jobs if j.dataset_filename})

    experiments_overview = ExperimentsOverview(
        total=total_exp,
        active=active_exp,
        succeeded=succeeded_exp,
        failed=failed_exp,
        unique_datasets=unique_datasets,
    )

    # 3. Deployments
    deploy_stmt = select(Deployment).order_by(Deployment.created_at.desc())
    if owner_id is not None:
        deploy_stmt = deploy_stmt.where(Deployment.owner_id == owner_id)
    deployments = db.execute(deploy_stmt).scalars().all()

    total_deploys = len(deployments)
    active_deploys = sum(1 for d in deployments if d.status == "active")
    stopped_deploys = sum(1 for d in deployments if d.status == "stopped")
    replaced_deploys = sum(1 for d in deployments if d.status == "replaced")

    deployments_overview = DeploymentsOverview(
        total=total_deploys,
        active=active_deploys,
        stopped=stopped_deploys,
        replaced=replaced_deploys,
    )

    # 4. Drift Alerts (Active vs. Resolved)
    deployment_ids = [d.id for d in deployments]
    deploy_map = {d.id: d for d in deployments}

    snapshots: list[MonitoringSnapshot] = []
    if owner_id is None:
        snap_stmt = select(MonitoringSnapshot).order_by(MonitoringSnapshot.created_at.desc())
        snapshots = db.execute(snap_stmt).scalars().all()
    elif deployment_ids:
        snap_stmt = select(MonitoringSnapshot).where(
            MonitoringSnapshot.deployment_id.in_(deployment_ids)
        ).order_by(MonitoringSnapshot.created_at.desc())
        snapshots = db.execute(snap_stmt).scalars().all()

    alertable_snaps = [s for s in snapshots if monitoring_service.is_alertable(s)]

    # Retraining candidates for alertable snapshots
    cand_stmt = select(RetrainingCandidate).where(RetrainingCandidate.monitoring_snapshot_id.isnot(None))
    if owner_id is not None:
        cand_stmt = cand_stmt.where(RetrainingCandidate.owner_id == owner_id)
    candidates = db.execute(cand_stmt).scalars().all()
    candidate_by_snapshot = {c.monitoring_snapshot_id: c for c in candidates}

    alert_items: list[DriftAlertItem] = []
    active_alerts = 0
    resolved_alerts = 0

    for s in alertable_snaps:
        deploy = deploy_map.get(s.deployment_id)
        model_name = deploy.model_name if deploy else "Unknown Model"
        cand = candidate_by_snapshot.get(s.id)

        is_resolved = False
        res_reason: str | None = None

        if cand and (cand.status == "approved" or cand.promoted_version_id is not None):
            is_resolved = True
            res_reason = "Resolved: Retrained candidate approved and promoted."
        elif cand and cand.status == "rejected":
            is_resolved = True
            res_reason = "Resolved: Candidate evaluation rejected."
        elif deploy and deploy.status in ("replaced", "stopped"):
            is_resolved = True
            res_reason = f"Resolved: Deployment slot was {deploy.status}."

        if is_resolved:
            resolved_alerts += 1
        else:
            active_alerts += 1

        alert_items.append(
            DriftAlertItem(
                snapshot_id=s.id,
                deployment_id=s.deployment_id,
                model_name=model_name,
                drift_share=s.drift_share,
                drift_detected=s.drift_detected,
                created_at=s.created_at,
                is_active=not is_resolved,
                status="active" if not is_resolved else "resolved",
                resolution_reason=res_reason,
            )
        )

    drift_alerts_overview = DriftAlertsOverview(
        total=len(alertable_snaps),
        active=active_alerts,
        resolved=resolved_alerts,
        recent_alerts=alert_items[:10],
    )

    # 5. Training Activity Over Time (Last 14 days)
    now = datetime.now(timezone.utc)
    day_counts: dict[str, int] = {}
    for i in range(13, -1, -1):
        day_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        day_counts[day_str] = 0

    for j in jobs:
        if j.created_at:
            j_date = j.created_at.strftime("%Y-%m-%d")
            if j_date in day_counts:
                day_counts[j_date] += 1

    training_activity = [
        DailyActivityPoint(date=d, count=c) for d, c in sorted(day_counts.items())
    ]

    # 6. Model Performance Comparison (Real Metrics)
    perf_points: list[ModelPerformancePoint] = []
    seen_models: set[str] = set()

    # Priority 1: Registered models (Production / Staging / Development)
    for v in versions:
        if v.model_name not in seen_models:
            card = v.model_card or {}
            metrics = card.get("metrics") or {}
            metric_name, metric_val = _extract_primary_metric(metrics)
            if metric_val is not None:
                perf_points.append(
                    ModelPerformancePoint(
                        model_name=v.model_name,
                        version=v.version,
                        stage=v.lifecycle_state,
                        metric_name=metric_name,
                        metric_value=metric_val,
                    )
                )
                seen_models.add(v.model_name)
        if len(perf_points) >= 6:
            break

    # Priority 2: Unregistered successful jobs if fewer than 4 models found
    if len(perf_points) < 4:
        for j in jobs:
            m_name = j.model_name or "Custom Model"
            if m_name not in seen_models and j.status == "succeeded" and j.metrics:
                metric_name, metric_val = _extract_primary_metric(j.metrics)
                if metric_val is not None:
                    perf_points.append(
                        ModelPerformancePoint(
                            model_name=m_name,
                            version=None,
                            stage="job",
                            metric_name=metric_name,
                            metric_value=metric_val,
                        )
                    )
                    seen_models.add(m_name)
            if len(perf_points) >= 6:
                break

    perf_points.sort(key=lambda p: p.metric_value, reverse=True)

    # 7. System Health Checks
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unreachable"

    cat_status = "ok"
    try:
        catalog.list_model_names()
    except Exception:
        cat_status = "unreachable"

    mlflow_status = "ok" if mlflow_adapter._get_mlflow() is not None else "unavailable"

    evidently_status = "ok"
    try:
        import evidently  # noqa: F401
    except ImportError:
        evidently_status = "unavailable"

    overall_api = "ok" if db_status == "ok" and cat_status == "ok" else "degraded"

    system_health = SystemHealthOverview(
        api=overall_api,
        database=db_status,
        model_catalog=cat_status,
        mlflow=mlflow_status,
        monitoring=evidently_status,
    )

    # 8. Recent Jobs (First 5)
    recent_jobs = [JobSummary.model_validate(j) for j in jobs[:5]]

    return OverviewStatsResponse(
        models=models_overview,
        experiments=experiments_overview,
        deployments=deployments_overview,
        drift_alerts=drift_alerts_overview,
        training_activity=training_activity,
        model_performance=perf_points,
        system_health=system_health,
        recent_jobs=recent_jobs,
    )


def _extract_primary_metric(metrics: dict[str, Any]) -> tuple[str, float | None]:
    """Helper to pick an appropriate primary metric (f1, accuracy, r2, rmse)
    from a metrics dictionary."""
    if not metrics:
        return "score", None

    for candidate in ["f1", "accuracy", "r2", "roc_auc", "precision", "recall", "rmse", "mae"]:
        val = metrics.get(candidate)
        if isinstance(val, (int, float)):
            return candidate.upper(), float(val)

    for k, v in metrics.items():
        if isinstance(v, (int, float)):
            return k, float(v)

    return "score", None
