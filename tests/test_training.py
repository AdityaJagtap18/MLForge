import pandas as pd
import pytest

from ml_core.training import TrainingValidationError, train_one_model


def _classification_df(n=60):
    import itertools

    rows = []
    for i in range(n):
        rows.append(
            {
                "age": 20 + (i % 40),
                "city": ["NY", "LA", "SF"][i % 3],
                "label": i % 2,
            }
        )
    return pd.DataFrame(rows)


def test_train_classification_model_end_to_end(isolated_env):
    df = _classification_df()
    result = train_one_model(df, ["age", "city"], "label", "Logistic Regression", {})
    assert result.task_type == "classification"
    assert "accuracy" in result.metrics
    assert result.n_train + result.n_test == len(df)


def test_train_regression_model_end_to_end(isolated_env):
    df = pd.DataFrame({"x": list(range(60)), "y": [v * 2.0 + 1.0 for v in range(60)]})
    result = train_one_model(df, ["x"], "y", "Linear Regression", {}, task_type="regression")
    assert result.task_type == "regression"
    assert result.metrics["r2"] > 0.9


def test_missing_column_raises_validation_error_not_crash(isolated_env):
    """BUG-06 fix: missing columns must be caught before model fitting, with
    a user-safe message, not surface as a raw ValueError/stack trace."""
    df = _classification_df()
    with pytest.raises(TrainingValidationError):
        train_one_model(df, ["age", "does_not_exist"], "label", "Logistic Regression", {})


def test_unknown_model_name_raises(isolated_env):
    from ml_core.catalog import UnknownModelError

    df = _classification_df()
    with pytest.raises(UnknownModelError):
        train_one_model(df, ["age"], "label", "Not A Real Model", {})
