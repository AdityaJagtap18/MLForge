"""Metric computation, factored out of the old src/metrics.py's file-writing
side effects so it can be called in-process and unit tested directly."""
from __future__ import annotations

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    explained_variance_score,
    max_error,
    mean_absolute_error,
    mean_squared_error,
    median_absolute_error,
    r2_score,
)


def classification_metrics(y_true, y_pred) -> dict:
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    return {
        "task_type": "classification",
        "accuracy": accuracy_score(y_true, y_pred),
        "f1": report["weighted avg"]["f1-score"],
        "precision": report["weighted avg"]["precision"],
        "recall": report["weighted avg"]["recall"],
        "report": report,
    }


def regression_metrics(y_true, y_pred) -> dict:
    return {
        "task_type": "regression",
        "r2": r2_score(y_true, y_pred),
        "mae": mean_absolute_error(y_true, y_pred),
        "mse": mean_squared_error(y_true, y_pred),
        "rmse": mean_squared_error(y_true, y_pred) ** 0.5,
        "max_error": max_error(y_true, y_pred),
        "median_absolute_error": median_absolute_error(y_true, y_pred),
        "explained_variance": explained_variance_score(y_true, y_pred),
    }


def compute_metrics(task_type: str, y_true, y_pred) -> dict:
    if task_type == "classification":
        return classification_metrics(y_true, y_pred)
    if task_type == "regression":
        return regression_metrics(y_true, y_pred)
    raise ValueError(f"Unknown task_type {task_type!r}")
