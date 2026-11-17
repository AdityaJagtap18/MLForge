"""Preprocessing pipeline: missing-value imputation, categorical encoding, scaling.

Fixes the "no preprocessing" architectural gap (PRD FR-PREP): the old
`src/train.py` called `.values` directly on raw selected columns, so any
non-numeric column raised a ValueError during `.fit()`.
"""
from __future__ import annotations

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def build_preprocessor(df: pd.DataFrame, input_cols: list[str]) -> ColumnTransformer:
    numeric_cols = [c for c in input_cols if pd.api.types.is_numeric_dtype(df[c])]
    categorical_cols = [c for c in input_cols if c not in numeric_cols]

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    transformers = []
    if numeric_cols:
        transformers.append(("numeric", numeric_pipeline, numeric_cols))
    if categorical_cols:
        transformers.append(("categorical", categorical_pipeline, categorical_cols))

    if not transformers:
        raise ValueError("No usable input columns to build a preprocessing pipeline from.")

    return ColumnTransformer(transformers=transformers, remainder="drop")
