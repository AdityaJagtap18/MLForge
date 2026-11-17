import pandas as pd
import pytest

from ml_core.task_detection import detect_task_type


def test_string_target_is_classification():
    s = pd.Series(["cat", "dog", "cat", "dog", "bird"])
    assert detect_task_type(s) == "classification"


def test_binary_integer_target_is_classification():
    s = pd.Series([0, 1, 0, 1, 1, 0] * 20)
    assert detect_task_type(s) == "classification"


def test_continuous_float_target_is_regression():
    s = pd.Series([1.2, 3.4, 5.6, 7.8, 9.1, 2.3, 4.5] * 10)
    assert detect_task_type(s) == "regression"


def test_high_cardinality_integer_target_is_regression():
    """The old heuristic (nunique <= 20 => classification) misclassified a
    continuous-looking integer target with low absolute cardinality but high
    cardinality relative to row count; this is BUG-03's regression case."""
    s = pd.Series(list(range(15)) * 10)  # 15 distinct ints, 150 rows
    # 15 <= 20 but 15/150 = 0.10 > 0.05, and n_rows > 50, so -> regression
    assert detect_task_type(s) == "regression"


def test_empty_series_raises():
    with pytest.raises(ValueError):
        detect_task_type(pd.Series([], dtype=float))
