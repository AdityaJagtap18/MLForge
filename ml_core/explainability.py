"""SHAP-based explainability (transformation prompt "Explainability with
SHAP"). Global feature importance only for Phase 2 -- local per-prediction
explanations are a documented Phase 2/3 follow-up, not implemented here.

Explicitly distinguishes "contribution" from causation in the response
message, per the prompt's own requirement, and degrades gracefully for
model types SHAP doesn't support well instead of crashing the request.
"""
from __future__ import annotations

import pandas as pd
from sklearn.pipeline import Pipeline


class ExplainabilityUnavailable(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def global_feature_importance(pipeline: Pipeline, X_sample: pd.DataFrame, max_rows: int = 100) -> dict:
    """Returns {feature_name: mean(|SHAP value|)} for the fitted pipeline's
    final estimator, computed over a small sample (not the full dataset --
    SHAP is expensive, and this is a summary, not a per-row audit)."""
    try:
        import shap
    except ImportError as exc:
        raise ExplainabilityUnavailable("The shap package is not installed on this server.") from exc

    if not isinstance(X_sample, pd.DataFrame) or X_sample.empty:
        raise ExplainabilityUnavailable("No input data available to explain (empty or invalid sample).")

    estimator = pipeline.named_steps.get("model")
    preprocessor = pipeline.named_steps.get("preprocess")
    if estimator is None or preprocessor is None:
        raise ExplainabilityUnavailable("Pipeline does not have the expected preprocess/model steps.")

    sample = X_sample.sample(n=min(max_rows, len(X_sample)), random_state=42)
    try:
        transformed = preprocessor.transform(sample)
        feature_names = list(preprocessor.get_feature_names_out())
    except Exception as exc:
        raise ExplainabilityUnavailable(f"Could not transform sample data for explanation: {exc}") from exc

    try:
        explainer = shap.Explainer(estimator, transformed)
        shap_values = explainer(transformed)
    except Exception as exc:
        # Not every estimator SHAP's generic Explainer supports (e.g. some
        # linear/NN combinations); fail as a clean "unsupported", not a 500.
        raise ExplainabilityUnavailable(
            f"SHAP does not support this model type ({estimator.__class__.__name__}) "
            f"out of the box: {exc}"
        ) from exc

    values = shap_values.values
    if values.ndim == 3:  # multi-class: average absolute contribution across classes
        values = values.mean(axis=2)
    if values.ndim != 2 or values.shape[1] != len(feature_names):
        raise ExplainabilityUnavailable(
            f"SHAP returned an unexpected output shape {values.shape} for "
            f"{len(feature_names)} features -- cannot map values to feature names."
        )

    mean_abs = abs(values).mean(axis=0)
    importance = {name: float(score) for name, score in zip(feature_names, mean_abs)}
    return dict(sorted(importance.items(), key=lambda kv: kv[1], reverse=True))
