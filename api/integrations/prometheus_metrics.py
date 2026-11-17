"""Prometheus instrumentation (transformation prompt: "Prometheus metrics
for API and worker health, training duration, inference latency, request
counts and error rates"). Degrades gracefully if prometheus_client isn't
installed -- the middleware becomes a no-op rather than crashing startup,
same reliability contract as the other integration adapters.
"""
from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("mlforge.prometheus")

try:
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

    _AVAILABLE = True
    REQUEST_COUNT = Counter("mlforge_http_requests_total", "Total HTTP requests", ["method", "path", "status"])
    REQUEST_LATENCY = Histogram("mlforge_http_request_duration_seconds", "HTTP request latency", ["method", "path"])
except ImportError as exc:  # pragma: no cover -- exercised only when the dependency is missing
    logger.warning("prometheus_client is not installed -- /metrics will be unavailable: %s", exc)
    _AVAILABLE = False
    CONTENT_TYPE_LATEST = "text/plain"


def is_available() -> bool:
    return _AVAILABLE


def render_latest() -> bytes:
    if not _AVAILABLE:
        return b"# prometheus_client is not installed on this server\n"
    return generate_latest()


class PrometheusMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not _AVAILABLE:
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        # route.path (e.g. "/api/v1/jobs/{job_id}"), not the raw URL, so
        # cardinality stays bounded regardless of how many distinct job ids
        # are requested.
        path_template = request.scope.get("route").path if request.scope.get("route") else request.url.path
        REQUEST_COUNT.labels(method=request.method, path=path_template, status=response.status_code).inc()
        REQUEST_LATENCY.labels(method=request.method, path=path_template).observe(duration)
        return response
