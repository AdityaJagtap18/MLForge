from __future__ import annotations

import os

from fastapi import Header, HTTPException, status

# FR-AUTH-01 (Phase 1): single shared API key, required on every write
# endpoint. No key configured => auth is disabled (local/dev convenience),
# but a startup warning is logged — see api/main.py.
API_KEY = os.environ.get("MLFORGE_API_KEY")


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if API_KEY is None:
        return  # auth disabled for local dev; never the case in a deployed env
    if x_api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key")
