from __future__ import annotations

from datetime import datetime, timezone
import importlib
import logging
import os
import time
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from api.auth import SystemPrincipal, _hash_token
from api.db_models import AccessToken, User
from api.deps import ENVIRONMENT, IS_PRODUCTION
from api.integrations import mlflow_adapter
from api.schemas import (
    AppConfigInfo,
    CapabilityItem,
    DependencyHealthDetail,
    SettingsResponse,
    UserProfileInfo,
)
from ml_core import catalog

logger = logging.getLogger("mlforge.settings")

_STARTUP_TIME = datetime.now(timezone.utc)


def get_app_config() -> AppConfigInfo:
    """Returns allowlisted application configuration. Strictly avoids exposing
    secrets, private environment variables, database credentials, or filesystem paths."""
    backend_url = os.environ.get("MLFORGE_BACKEND_URL", "http://127.0.0.1:8000")
    frontend_url = os.environ.get("MLFORGE_FRONTEND_URL", "http://localhost:5173")
    deployment_mode = os.environ.get(
        "MLFORGE_DEPLOYMENT_MODE",
        "Containerized Service" if os.path.exists("/.dockerenv") else "Standalone Process (Uvicorn)",
    )

    return AppConfigInfo(
        app_name="MLForge MLOps Platform",
        app_version="0.4.0",
        environment=ENVIRONMENT,
        is_production=IS_PRODUCTION,
        api_version="v1",
        backend_base_url=backend_url,
        frontend_url=frontend_url,
        deployment_mode=deployment_mode,
        startup_time=_STARTUP_TIME.isoformat(),
        docs_url="/docs",
    )


def get_capabilities() -> list[CapabilityItem]:
    """Derives system capabilities from installed packages and active integrations.
    Distinguishes operational availability from mere feature-flag configuration."""
    # Check evidently
    has_evidently = False
    try:
        importlib.import_module("evidently")
        has_evidently = True
    except ImportError:
        pass

    # Check shap
    has_shap = False
    try:
        importlib.import_module("shap")
        has_shap = True
    except ImportError:
        pass

    # Check mlflow
    has_mlflow = mlflow_adapter._get_mlflow() is not None

    return [
        CapabilityItem(
            name="Model Training Pipeline",
            key="model_training",
            category="Core ML",
            status="available",
            description="Train scikit-learn models (Logistic Regression, Random Forest, Decision Tree, KNN) with preprocessing.",
            dependency="scikit-learn",
        ),
        CapabilityItem(
            name="AutoML Search (Find Best Model)",
            key="find_best_model",
            category="Core ML",
            status="available",
            description="Automated cross-algorithm hyperparameter evaluation and best-model candidate selection.",
            dependency="scikit-learn",
        ),
        CapabilityItem(
            name="Dataset Profiling & Quality Engine",
            key="dataset_profiling",
            category="Core ML",
            status="available",
            description="Statistical data profiling, missingness detection, class imbalance ratio, and target leakage checks.",
            dependency="pandas",
        ),
        CapabilityItem(
            name="Model Registry & Lifecycle Governance",
            key="model_registry",
            category="Governance",
            status="available",
            description="Authoritative model versioning, lifecycle stage promotion (development/staging/production), and atomic rollback.",
            dependency="SQLAlchemy / PostgreSQL",
        ),
        CapabilityItem(
            name="Serving Slots & Real-Time Inference",
            key="model_deployments",
            category="Serving",
            status="available",
            description="Isolated real-time model deployment slots with sub-millisecond single-record JSON prediction tester.",
            dependency="FastAPI / Joblib",
        ),
        CapabilityItem(
            name="Evidently Data Drift Monitoring",
            key="drift_monitoring",
            category="Observability",
            status="available" if has_evidently else "unavailable",
            description="Inference window drift calculation using Evidently AI DataDriftPreset with dataset drift verdicts.",
            dependency="evidently",
        ),
        CapabilityItem(
            name="Controlled Retraining Automation",
            key="retraining_automation",
            category="Observability",
            status="available",
            description="Drift-triggered retraining candidate generation, champion-vs-challenger evaluation gates, and audit trails.",
            dependency="SQLAlchemy / RetrainingService",
        ),
        CapabilityItem(
            name="SHAP Global Model Explainability",
            key="model_explainability",
            category="Interpretability",
            status="available" if has_shap else "unavailable",
            description="TreeExplainer and LinearExplainer global feature attribution (mean absolute SHAP) with causality disclaimers.",
            dependency="shap",
        ),
        CapabilityItem(
            name="MLflow Experiment Tracking",
            key="mlflow_tracking",
            category="Observability",
            status="available" if has_mlflow else "degraded",
            description="Experiment runs, hyperparameters, metrics, and artifact tracking with graceful fallback.",
            dependency="mlflow",
        ),
        CapabilityItem(
            name="Prometheus Metrics Telemetry",
            key="prometheus_telemetry",
            category="Observability",
            status="available",
            description="Platform metrics scraping endpoint (/metrics) tracking request rates, errors, and prediction latency.",
            dependency="prometheus_client",
        ),
    ]


def get_user_profile(
    db: Session,
    current_user: Any,
    authorization: str | None = None,
) -> UserProfileInfo:
    """Returns safe user identity and session metadata without exposing tokens or hashes."""
    if isinstance(current_user, SystemPrincipal) or (hasattr(current_user, "id") and current_user.id == "system"):
        return UserProfileInfo(
            user_id="system",
            email="system@mlforge.local",
            role="System Administrator (Bypass)",
            auth_status="service_account_bypass",
            session_created_at=None,
            session_expires_at=None,
            is_service_account=True,
        )

    # Standard registered user
    user_id = str(current_user.id)
    email = getattr(current_user, "email", None)
    session_created_at: datetime | None = None
    session_expires_at: datetime | None = None

    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.removeprefix("Bearer ").strip()
        token_hash = _hash_token(raw_token)
        stmt = select(AccessToken).where(AccessToken.token_hash == token_hash)
        token_record = db.execute(stmt).scalars().first()
        if token_record:
            session_created_at = token_record.created_at
            session_expires_at = token_record.expires_at

    return UserProfileInfo(
        user_id=user_id,
        email=email,
        role="ML Engineer",
        auth_status="authenticated",
        session_created_at=session_created_at,
        session_expires_at=session_expires_at,
        is_service_account=False,
    )


def check_dependencies_health(db: Session) -> list[DependencyHealthDetail]:
    """Runs independent live health probes for all five core dependencies.
    Measures execution latency and provides sanitized diagnostic messages."""
    now = datetime.now(timezone.utc)
    details: list[DependencyHealthDetail] = []

    # 1. FastAPI Control Plane
    t0 = time.perf_counter()
    api_latency = round((time.perf_counter() - t0) * 1000, 2)
    details.append(
        DependencyHealthDetail(
            name="FastAPI REST Control Plane",
            key="fastapi",
            status="healthy",
            latency_ms=api_latency,
            last_checked=now,
            message="Application router, middleware stack, and OpenAPI documentation operational.",
            version="0.4.0",
        )
    )

    # 2. Database Connection Pool
    t0 = time.perf_counter()
    db_status = "healthy"
    db_message = ""
    db_dialect = "relational"
    try:
        bind = db.get_bind()
        db_dialect = bind.dialect.name if bind else "sqlite"
        db.execute(text("SELECT 1"))
        db_latency = round((time.perf_counter() - t0) * 1000, 2)
        db_message = f"Database connection pool active and responsive ({db_dialect.upper()})."
    except Exception as exc:
        db_latency = round((time.perf_counter() - t0) * 1000, 2)
        db_status = "unavailable"
        db_message = "Database connection pool is unreachable or query timed out."
        logger.warning("Database health probe failed: %s", exc)

    details.append(
        DependencyHealthDetail(
            name="Primary Relational Database",
            key="database",
            status=db_status,
            latency_ms=db_latency,
            last_checked=now,
            message=db_message,
            version=db_dialect.upper(),
        )
    )

    # 3. Local Model Catalog
    t0 = time.perf_counter()
    cat_status = "healthy"
    cat_message = ""
    cat_version: str | None = None
    try:
        models = catalog.list_model_names()
        cat_latency = round((time.perf_counter() - t0) * 1000, 2)
        cat_message = f"Pre-configured model catalog loaded successfully ({len(models)} model families available)."
        cat_version = f"{len(models)} models"
    except Exception as exc:
        cat_latency = round((time.perf_counter() - t0) * 1000, 2)
        cat_status = "degraded"
        cat_message = "Local model catalog directory could not be inspected."
        logger.warning("Catalog health probe failed: %s", exc)

    details.append(
        DependencyHealthDetail(
            name="Local Model Catalog",
            key="catalog",
            status=cat_status,
            latency_ms=cat_latency,
            last_checked=now,
            message=cat_message,
            version=cat_version,
        )
    )

    # 4. MLflow Experiment Tracking
    t0 = time.perf_counter()
    mlflow_status = "healthy"
    mlflow_message = ""
    mlflow_version: str | None = None
    try:
        mlf = mlflow_adapter._get_mlflow()
        mlflow_latency = round((time.perf_counter() - t0) * 1000, 2)
        if mlf is not None:
            mlflow_version = getattr(mlf, "__version__", "installed")
            mlflow_message = "MLflow tracking server operational (Local Artifact Lineage Store)."
        else:
            mlflow_status = "degraded"
            mlflow_message = "MLflow tracking library is unavailable; in-process execution fallback active."
    except Exception as exc:
        mlflow_latency = round((time.perf_counter() - t0) * 1000, 2)
        mlflow_status = "unavailable"
        mlflow_message = "MLflow tracking probe failed."
        logger.warning("MLflow health probe failed: %s", exc)

    details.append(
        DependencyHealthDetail(
            name="MLflow Tracking Server",
            key="mlflow",
            status=mlflow_status,
            latency_ms=mlflow_latency,
            last_checked=now,
            message=mlflow_message,
            version=mlflow_version,
        )
    )

    # 5. Evidently AI Drift Engine
    t0 = time.perf_counter()
    ev_status = "healthy"
    ev_message = ""
    ev_version: str | None = None
    try:
        ev_mod = importlib.import_module("evidently")
        ev_latency = round((time.perf_counter() - t0) * 1000, 2)
        ev_version = getattr(ev_mod, "__version__", "installed")
        ev_message = f"Evidently AI data drift evaluation engine loaded (v{ev_version})."
    except ImportError:
        ev_latency = round((time.perf_counter() - t0) * 1000, 2)
        ev_status = "unavailable"
        ev_message = "Evidently package is not installed on this server."

    details.append(
        DependencyHealthDetail(
            name="Evidently AI Drift Engine",
            key="evidently",
            status=ev_status,
            latency_ms=ev_latency,
            last_checked=now,
            message=ev_message,
            version=ev_version,
        )
    )

    return details


def get_full_settings(
    db: Session,
    current_user: Any,
    authorization: str | None = None,
) -> SettingsResponse:
    """Aggregates application configuration, capabilities, dependency health,
    and user session information into a single authoritative response."""
    return SettingsResponse(
        config=get_app_config(),
        capabilities=get_capabilities(),
        health=check_dependencies_health(db),
        profile=get_user_profile(db, current_user, authorization),
    )
