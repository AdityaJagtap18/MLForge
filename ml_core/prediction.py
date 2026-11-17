"""Inference against a previously trained pipeline. Closes the FR-PREDICT gap
(`frontend/use-model.html` had no backend wiring at all before Phase 1)."""
from __future__ import annotations

import pandas as pd
from sklearn.pipeline import Pipeline


class PredictionValidationError(ValueError):
    pass


def predict(pipeline: Pipeline, df: pd.DataFrame, input_cols: list[str]) -> pd.Series:
    missing = [c for c in input_cols if c not in df.columns]
    if missing:
        raise PredictionValidationError(
            f"Column(s) required by the model are missing from the input CSV: {missing}"
        )
    predictions = pipeline.predict(df[input_cols])
    return pd.Series(predictions, index=df.index)
