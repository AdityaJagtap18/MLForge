import numpy as np
import pandas as pd
import pytest

from ml_core.preprocessing import build_preprocessor


def test_handles_mixed_numeric_and_categorical_columns():
    """This is the core FR-PREP regression test: the old src/train.py called
    `.values` on raw columns and raised ValueError on any non-numeric column."""
    df = pd.DataFrame(
        {
            "age": [25, 30, np.nan, 40],
            "city": ["NY", "LA", "NY", None],
            "target": [0, 1, 0, 1],
        }
    )
    preprocessor = build_preprocessor(df, ["age", "city"])
    transformed = preprocessor.fit_transform(df[["age", "city"]])
    assert transformed.shape[0] == 4
    assert not np.isnan(transformed).any()


def test_numeric_only_columns():
    df = pd.DataFrame({"a": [1, 2, 3], "b": [4.0, 5.0, 6.0]})
    preprocessor = build_preprocessor(df, ["a", "b"])
    transformed = preprocessor.fit_transform(df[["a", "b"]])
    assert transformed.shape == (3, 2)


def test_no_input_columns_raises():
    df = pd.DataFrame({"a": [1, 2, 3]})
    with pytest.raises(ValueError):
        build_preprocessor(df, [])
