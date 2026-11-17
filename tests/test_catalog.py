import pytest

from ml_core import catalog


def test_list_model_names_includes_known_models(isolated_env):
    names = catalog.list_model_names()
    assert "Linear Regression" in names
    assert "Logistic Regression" in names
    assert len(names) > 30


def test_get_allowed_models_classification_excludes_regression_only(isolated_env):
    allowed = catalog.get_allowed_models("classification")
    assert "Logistic Regression" in allowed
    assert "Linear Regression" not in allowed


def test_get_allowed_models_invalid_task_type_raises(isolated_env):
    with pytest.raises(ValueError):
        catalog.get_allowed_models("not-a-real-task-type")


def test_instantiate_model_unknown_name_raises(isolated_env):
    with pytest.raises(catalog.UnknownModelError):
        catalog.instantiate_model("Definitely Not A Real Model", {})


def test_instantiate_model_builds_sklearn_estimator(isolated_env):
    estimator = catalog.instantiate_model("Logistic Regression", {})
    assert estimator.__class__.__name__ == "LogisticRegression"


def test_every_trainable_catalog_model_class_is_importable(isolated_env):
    """Regression test called out in docs/implementation-plan.md: catches
    catalog/dependency drift (a class renamed/removed by a scikit-learn
    upgrade) at test time instead of at request time. Scoped to rows
    model_capabilities.csv flags as an actual classification/regression
    estimator -- vectorizer-only utility rows (e.g. "Count Vectorizer") are
    intentionally not resolvable here; they back the orphaned/deferred text
    classifier feature, not tabular training (see docs/backlog.md)."""
    trainable_names = set(catalog.get_allowed_models("classification")) | set(
        catalog.get_allowed_models("regression")
    )
    unresolved = [name for name in trainable_names if catalog.get_model_class_name(name) not in catalog._CLASS_REGISTRY]
    assert not unresolved, f"Trainable catalog entries with unresolvable sklearn classes: {unresolved}"
