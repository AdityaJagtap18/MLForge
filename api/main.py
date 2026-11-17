from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import init_db
from api.deps import API_KEY
from api.routers import catalog_router, health, jobs, predict, training

logger = logging.getLogger("mlforge")

app = FastAPI(title="MLForge API", version="0.1.0")

_allowed_origins = [o for o in os.environ.get("MLFORGE_CORS_ORIGINS", "").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    if API_KEY is None:
        logger.warning(
            "MLFORGE_API_KEY is not set — write endpoints are UNAUTHENTICATED. "
            "Set MLFORGE_API_KEY before deploying beyond local development."
        )


# Versioned API surface (transformation prompt §API governance).
app.include_router(health.router, prefix="/api/v1")
app.include_router(catalog_router.router, prefix="/api/v1")
app.include_router(training.router, prefix="/api/v1")
app.include_router(predict.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")

# Deprecated unversioned aliases, kept one release for any existing caller of
# the original static-frontend-era paths. Log a deprecation warning and
# remove once nothing exercises them (see docs/adr/0005).
app.include_router(catalog_router.router)
app.include_router(training.router)


@app.get("/")
def root():
    return {"status": "MLForge API is running", "docs": "/docs", "api": "/api/v1"}
