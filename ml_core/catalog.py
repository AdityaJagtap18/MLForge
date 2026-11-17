"""Model catalog: name -> sklearn class, and task-type applicability flags.

Fixes BUG-01: the catalog file is `baml_model_tbl.csv`, not the
nonexistent `MLForge_model_tbl.csv` the old `Config.CSV_CONFIG`
pointed at.
"""
from __future__ import annotations

import os
from functools import lru_cache

import pandas as pd
from sklearn import linear_model, naive_bayes, neighbors, neural_network, svm, tree

MLFORGE_FILES_DIR = os.environ.get(
    "MLFORGE_FILES_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MLForge_files"),
)
MODEL_CATALOG_CSV = os.path.join(MLFORGE_FILES_DIR, "csv_configurations", "baml_model_tbl.csv")
MODEL_CAPABILITIES_CSV = os.path.join(MLFORGE_FILES_DIR, "csv_configurations", "model_capabilities.csv")
_BUNDLED_CONFIG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MLForge_files", "csv_configurations"
)


def _resolve_csv_path(path: str, filename: str) -> str:
    if os.path.exists(path):
        return path
    bundled = os.path.join(_BUNDLED_CONFIG_DIR, filename)
    if os.path.exists(bundled):
        return bundled
    return path


_CLASS_REGISTRY: dict[str, type] = {}
for _module in (linear_model, neighbors, naive_bayes, tree, svm, neural_network):
    for _name in dir(_module):
        _obj = getattr(_module, _name)
        if isinstance(_obj, type):
            _CLASS_REGISTRY[_name] = _obj


class UnknownModelError(ValueError):
    pass


@lru_cache(maxsize=1)
def _load_catalog_df() -> pd.DataFrame:
    path = _resolve_csv_path(MODEL_CATALOG_CSV, "baml_model_tbl.csv")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Model catalog not found at {path!r}. Expected columns: "
            "MODEL_NAME, MODEL_CLASS."
        )
    return pd.read_csv(path)


@lru_cache(maxsize=1)
def _load_capabilities_df() -> pd.DataFrame:
    path = _resolve_csv_path(MODEL_CAPABILITIES_CSV, "model_capabilities.csv")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model capabilities file not found at {path!r}.")
    return pd.read_csv(path)


def clear_cache() -> None:
    """Test helper: catalog CSVs are loaded once per process by default."""
    _load_catalog_df.cache_clear()
    _load_capabilities_df.cache_clear()


def list_model_names() -> list[str]:
    return _load_catalog_df()["MODEL_NAME"].dropna().tolist()


def get_allowed_models(task_type: str) -> list[str]:
    """Models in model_capabilities.csv flagged for the given task type."""
    caps = _load_capabilities_df()
    if task_type == "classification":
        allowed = caps[caps["IS_CLASSIFICATION"] == 1]
    elif task_type == "regression":
        allowed = caps[caps["IS_REGRESSION"] == 1]
    else:
        raise ValueError(f"Unknown task_type {task_type!r}; expected 'classification' or 'regression'")
    return allowed["MODEL_NAME"].tolist()


def get_model_class_name(model_name: str) -> str:
    df = _load_catalog_df()
    row = df[df["MODEL_NAME"] == model_name]
    if row.empty:
        raise UnknownModelError(
            f"Model {model_name!r} not found in catalog. Available models: {df['MODEL_NAME'].tolist()}"
        )
    return str(row["MODEL_CLASS"].values[0])


def instantiate_model(model_name: str, model_params: dict):
    class_name = get_model_class_name(model_name)
    klass = _CLASS_REGISTRY.get(class_name)
    if klass is None:
        raise UnknownModelError(
            f"Model class {class_name!r} for {model_name!r} is not registered/importable."
        )
    return klass(**model_params)
