# Tests for the timeout optimizer module (Step 8 fills the real model logic).

from fastapi.testclient import TestClient

from app.data.model_cache import model_cache
from app.main import app

client = TestClient(app)


def test_timeout_recommend_returns_501_until_model_implemented():
    res = client.post(
        "/timeout/recommend",
        json={
            "sport": "nfl",
            "consecutiveScores": 2,
            "scoreDiff": -7,
            "timeRemaining": 131.0,
            "period": 4,
        },
    )
    assert res.status_code == 501  # NotImplementedError → "lands in Step 8"


def test_model_cache_roundtrip():
    model_cache.clear()
    assert model_cache.size() == 0
    model_cache.set("test-model", {"fitted": True})
    assert model_cache.has("test-model")
    assert model_cache.get("test-model") == {"fitted": True}
    model_cache.remove("test-model")
    assert not model_cache.has("test-model")
