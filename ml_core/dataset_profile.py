"""Dataset quality/validation profiling (PRD FR-PREP / transformation prompt
"Dataset quality and validation"). Explainable heuristics only -- this does
not claim perfect leakage detection, per the prompt's own caveat.
"""
from __future__ import annotations

import pandas as pd


def profile_dataset(df: pd.DataFrame, target_col: str | None = None) -> dict:
    n_rows, n_cols = df.shape
    duplicate_rows = int(df.duplicated().sum())

    columns = []
    constant_columns = []
    for col in df.columns:
        series = df[col]
        n_unique = series.nunique(dropna=True)
        is_constant = n_unique <= 1
        if is_constant:
            constant_columns.append(col)
        columns.append(
            {
                "name": col,
                "dtype": str(series.dtype),
                "missing_count": int(series.isna().sum()),
                "missing_pct": round(float(series.isna().mean()) * 100, 2),
                "n_unique": int(n_unique),
                "is_constant": is_constant,
            }
        )

    target_distribution = None
    class_imbalance_ratio = None
    leakage_warnings: list[str] = []

    if target_col and target_col in df.columns:
        target = df[target_col].dropna()
        if pd.api.types.is_numeric_dtype(target) and target.nunique() > 20:
            target_distribution = {
                "min": float(target.min()),
                "max": float(target.max()),
                "mean": float(target.mean()),
                "std": float(target.std()),
            }
        else:
            counts = target.value_counts()
            target_distribution = {str(k): int(v) for k, v in counts.items()}
            if len(counts) >= 2:
                class_imbalance_ratio = round(float(counts.max() / counts.min()), 2)
                if class_imbalance_ratio >= 10:
                    leakage_warnings.append(
                        f"Severe class imbalance detected ({class_imbalance_ratio}:1) -- "
                        "consider resampling or a metric robust to imbalance."
                    )

        # Explainable, heuristic-only leakage check: any other column that is
        # (near-)perfectly correlated with, or identical to, the target.
        for col in df.columns:
            if col == target_col or not pd.api.types.is_numeric_dtype(df[col]):
                continue
            if pd.api.types.is_numeric_dtype(target):
                try:
                    corr = df[[col, target_col]].dropna().corr().iloc[0, 1]
                except Exception:
                    corr = None
                if corr is not None and abs(corr) >= 0.98:
                    leakage_warnings.append(
                        f"Column {col!r} is suspiciously correlated with the target "
                        f"(|r|={abs(corr):.3f}) -- check it isn't derived from the target."
                    )

    if n_rows and duplicate_rows / n_rows > 0.3:
        leakage_warnings.append(f"{duplicate_rows} of {n_rows} rows are exact duplicates (>30%).")

    return {
        "n_rows": n_rows,
        "n_columns": n_cols,
        "columns": columns,
        "duplicate_rows": duplicate_rows,
        "constant_columns": constant_columns,
        "target_column": target_col,
        "target_distribution": target_distribution,
        "class_imbalance_ratio": class_imbalance_ratio,
        "leakage_warnings": leakage_warnings,
    }
