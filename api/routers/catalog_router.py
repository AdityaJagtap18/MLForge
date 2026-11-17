from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas import ModelsResponse
from ml_core import catalog

router = APIRouter(tags=["catalog"])


@router.get("/models", response_model=ModelsResponse)
def get_models() -> ModelsResponse:
    """Fixes BUG-01 (Config.CSV_CONFIG pointed at a nonexistent file)."""
    try:
        return ModelsResponse(models=catalog.list_model_names())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Model catalog is unavailable.") from exc
