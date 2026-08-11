# Tests for the Step 11 health endpoint.

from datetime import datetime

from fastapi.testclient import TestClient

from app.data import nfl_bridge as bridge
from app.data.model_cache import model_cache
from app.main import app

client = TestClient(app)


def test_health_returns_spec_shape(monkeypatch):
    # Pin the bridge sentinel so this test never mutates shared module state
    # (and so nflDataAvailable is deterministic regardless of environment).
    monkeypatch.setattr(bridge, "_nfl_data_py", False)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["environment"] in ("development", "production")
    models = body["models"]
    assert set(models.keys()) == {"wpModel", "decisionModel", "momentumModel", "timeoutModel"}
    for status in models.values():
        assert status in ("loaded", "not loaded")
    assert isinstance(body["nflDataAvailable"], bool)
    datetime.fromisoformat(body["timestamp"])  # must be ISO-8601


def test_health_reflects_cached_models():
    """Models with trained artifacts cached report 'loaded'."""
    wp = object()
    seeded_keys = ("wp_model", "momentum_cox:nfl", "timeout_tree")
    prior = {k: (model_cache.has(k), model_cache.get(k)) for k in seeded_keys}
    try:
        model_cache.set("wp_model", wp)
        model_cache.set("momentum_cox:nfl", {"hazard_ratio": 1.5})
        model_cache.set("timeout_tree", wp)
        body = client.get("/health").json()
        assert body["models"]["wpModel"] == "loaded"
        assert body["models"]["momentumModel"] == "loaded"
        assert body["models"]["timeoutModel"] == "loaded"
        assert body["models"]["decisionModel"] == "loaded"  # code-embedded tables
    finally:
        # Restore prior cache state — never clobber other modules' entries.
        for key, (existed, value) in prior.items():
            if existed:
                model_cache.set(key, value)
            else:
                model_cache.remove(key)
        body = client.get("/health").json()
        assert body["models"]["wpModel"] == "not loaded"
        assert body["models"]["momentumModel"] == "not loaded"
        assert body["models"]["timeoutModel"] == "not loaded"
