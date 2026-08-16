# Shared pytest configuration.
#
# The model modules degrade to deterministic heuristic rules unless a fitted
# artifact or training-data path is configured (WP_MODEL_PATH / WP_TRAINING_DATA
# / TIMEOUT_MODEL_PATH / TIMEOUT_TRAINING_DATA). A local .env commonly sets
# those, which makes models train from committed data during the suite and
# changes behavior the tests assert against the heuristic. This autouse fixture
# unsets them for every test and clears the shared in-memory model cache, so
# the suite is deterministic whether or not a .env is present. Tests that
# deliberately exercise the trained path opt back in themselves
# (e.g. test_wp_model_train_roundtrip, test_decision_tree_trains_and_recommends).

import pytest

from app.data.model_cache import model_cache

_AMBIENT_ML_ENV = (
    "WP_MODEL_PATH",
    "WP_TRAINING_DATA",
    "TIMEOUT_MODEL_PATH",
    "TIMEOUT_TRAINING_DATA",
)


@pytest.fixture(autouse=True)
def _isolate_model_env(monkeypatch, tmp_path):
    """Unset ambient ML env vars, hide any stray trained artifact, and clear
    the model cache per test."""
    for key in _AMBIENT_ML_ENV:
        monkeypatch.delenv(key, raising=False)
    # A warmup run writes models/wp_model.joblib; without WP_MODEL_PATH set,
    # ensure_loaded() falls back to that default path and loads it. Point it
    # at a path that cannot exist so tests always use the deterministic
    # heuristic unless they opt into the trained path themselves.
    monkeypatch.setenv("WP_MODEL_PATH", str(tmp_path / "no_model.joblib"))
    model_cache.clear()
    yield
    model_cache.clear()
