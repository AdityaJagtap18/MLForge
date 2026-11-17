"""Task-type detection. Fixes BUG-03.

The old heuristic (`nunique(target) <= 20 -> classification`) misclassified
integer-valued regression targets with few distinct values and misclassified
high-cardinality classification targets as regression.

New heuristic, in order:
1. Non-numeric dtype (object/category/bool) -> classification.
2. Numeric dtype:
   - If every value is integral AND the number of distinct values is small
     relative to the row count (<=20 distinct values, and distinct values are
     <=5% of row count when there are more than 50 rows) -> classification.
   - Otherwise -> regression.
This is an explainable heuristic, not perfect; callers may always override it
by passing an explicit task_type.
"""
from __future__ import annotations

import pandas as pd


def detect_task_type(series: pd.Series) -> str:
    series = series.dropna()
    if series.empty:
        raise ValueError("Target column has no non-null values; cannot detect task type.")

    if not pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return "classification"

    is_integral = (series % 1 == 0).all()
    n_unique = series.nunique()
    n_rows = len(series)

    if not is_integral:
        return "regression"

    if n_unique <= 20 and (n_rows <= 50 or n_unique / n_rows <= 0.05):
        return "classification"

    return "regression"
