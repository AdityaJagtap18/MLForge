from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from api.db import init_db
from api.deps import API_KEY, ENVIRONMENT, IS_PRODUCTION
from api.integrations import prometheus_metrics
from api.routers import auth, catalog_router, datasets, deployments, explain, health, jobs, overview, predict, registry, retraining, settings, training

logger = logging.getLogger("mlforge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("MLFORGE_ENV=%s (IS_PRODUCTION=%s)", ENVIRONMENT, IS_PRODUCTION)
    if IS_PRODUCTION:
        if API_KEY is None:
            logger.warning(
                "Running with MLFORGE_ENV=%s and no MLFORGE_API_KEY set. The local-dev "
                "auth bypass is disabled in this mode either way (every request needs a "
                "valid bearer token), but the legacy service-account path is unavailable "
                "until MLFORGE_API_KEY is set.",
                ENVIRONMENT,
            )
    elif API_KEY is None:
        logger.warning(
            "MLFORGE_API_KEY is not set and MLFORGE_ENV=development — write endpoints "
            "fall back to the local-dev auth bypass until the first user registers. "
            "Set MLFORGE_ENV=production (and MLFORGE_API_KEY, if you need the legacy "
            "service-account path) before deploying beyond local development."
        )
    yield


app = FastAPI(title="MLForge API", version="0.4.0", lifespan=lifespan)

_allowed_origins = [o for o in os.environ.get("MLFORGE_CORS_ORIGINS", "").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(prometheus_metrics.PrometheusMiddleware)


# Versioned API surface (transformation prompt §API governance).
app.include_router(health.router, prefix="/api/v1")
app.include_router(catalog_router.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(training.router, prefix="/api/v1")
app.include_router(predict.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(registry.router, prefix="/api/v1")
app.include_router(explain.router, prefix="/api/v1")
app.include_router(deployments.router, prefix="/api/v1")
app.include_router(retraining.router, prefix="/api/v1")
app.include_router(overview.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")


@app.get("/metrics")
def metrics():
    return Response(content=prometheus_metrics.render_latest(), media_type=prometheus_metrics.CONTENT_TYPE_LATEST)

# Deprecated unversioned aliases, kept one release for any existing caller of
# the original static-frontend-era paths. Log a deprecation warning and
# remove once nothing exercises them (see docs/adr/0005).
app.include_router(catalog_router.router)
app.include_router(training.router)


@app.get("/")
def root():
    return {"status": "MLForge API is running", "docs": "/docs", "api": "/api/v1"}
