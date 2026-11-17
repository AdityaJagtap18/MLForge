"""In-process training, replacing the old subprocess-per-model execution
(api/main.py used to shell out to `python3 src/model.py ...`).

Fixes BUG-04 (fragile `$`-for-`"` JSON workaround -> plain json.loads) and
BUG-06 (no validation of input/target columns against the uploaded CSV).
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from ml_core import metrics as metrics_mod
from ml_core.catalog import instantiate_model
from ml_core.preprocessing import build_preprocessor
from ml_core.task_detection import detect_task_type


class TrainingValidationError(ValueError):
    """Raised for user-input problems; safe to surface to API callers verbatim."""


@dataclass
class TrainingResult:
    pipeline: Pipeline
    task_type: str
    metrics: dict
    n_train: int
    n_test: int


def validate_columns(df: pd.DataFrame, input_cols: list[str], target_col: str) -> None:
    missing = [c for c in [*input_cols, target_col] if c not in df.columns]
    if missing:
        raise TrainingValidationError(
            f"Column(s) not found in uploaded CSV: {missing}. Available columns: {list(df.columns)}"
        )
    if target_col in input_cols:
        raise TrainingValidationError("target_col must not also appear in input_cols.")
    if not input_cols:
        raise TrainingValidationError("input_cols must contain at least one column.")


def train_one_model(
    df: pd.DataFrame,
    input_cols: list[str],
    target_col: str,
    model_name: str,
    model_params: dict,
    task_type: str | None = None,
    random_state: int = 42,
) -> TrainingResult:
    validate_columns(df, input_cols, target_col)

    df = df.dropna(subset=[target_col])
    if df.empty:
        raise TrainingValidationError("No rows remain after dropping missing target values.")

    resolved_task_type = task_type or detect_task_type(df[target_col])
    estimator = instantiate_model(model_name, model_params)

    preprocessor = build_preprocessor(df, input_cols)
    pipeline = Pipeline(steps=[("preprocess", preprocessor), ("model", estimator)])

    X = df[input_cols]
    y = df[target_col]

    stratify = y if resolved_task_type == "classification" and y.value_counts().min() >= 2 else None
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=random_state, stratify=stratify
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=random_state
        )

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    computed_metrics = metrics_mod.compute_metrics(resolved_task_type, y_test, y_pred)

    return TrainingResult(
        pipeline=pipeline,
        task_type=resolved_task_type,
        metrics=computed_metrics,
        n_train=len(X_train),
        n_test=len(X_test),
    )
