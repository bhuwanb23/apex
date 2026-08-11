# Tests for the timeout optimizer module (Step 8).

import json
import os
import random
import tempfile

from fastapi.testclient import TestClient

from app.data.model_cache import model_cache
from app.main import app
from app.models.timeout_model import TimeoutModel, scenario_key

client = TestClient(app)


def test_recommend_endpoint_returns_full_response():
    res = client.post(
        "/timeout/recommend",
        json={
            "sport": "NFL",
            "consecutiveScores": 3,
            "scoreDiff": -7,
            "timeRemaining": 90.0,
            "period": 4,
            "timeoutsAvailable": 2,
        },
    )
    assert res.status_code == 200
    body = res.json()
    for field in (
        "shouldCallTimeout",
        "stopProbabilityWith",
        "stopProbabilityWithout",
        "probabilityDiff",
        "confidenceLevel",
        "recommendationText",
    ):
        assert field in body
    assert 0.0 <= body["stopProbabilityWith"] <= 1.0
    assert 0.0 <= body["stopProbabilityWithout"] <= 1.0
    assert body["confidenceLevel"] in ("high", "medium", "low")
    assert body["probabilityDiff"] == round(body["stopProbabilityWith"] - body["stopProbabilityWithout"], 4)


def test_hot_situation_recommends_timeout():
    """Opponent on a 4-score run with under a minute left → call the timeout."""
    res = client.post(
        "/timeout/recommend",
        json={
            "sport": "NBA",
            "consecutiveScores": 4,
            "scoreDiff": -9,
            "timeRemaining": 45.0,
            "period": 4,
            "timeoutsAvailable": 3,
        },
    )
    body = res.json()
    assert body["shouldCallTimeout"] is True
    assert body["stopProbabilityWith"] > body["stopProbabilityWithout"]
    assert "Call a timeout" in body["recommendationText"]


def test_calm_situation_no_timeout():
    """No opponent momentum, plenty of time → letting it play is better."""
    res = client.post(
        "/timeout/recommend",
        json={
            "sport": "NFL",
            "consecutiveScores": 0,
            "scoreDiff": 3,
            "timeRemaining": 720.0,
            "period": 2,
            "timeoutsAvailable": 3,
        },
    )
    body = res.json()
    assert body["shouldCallTimeout"] is False
    assert "Let the play run" in body["recommendationText"]


def test_precompute_returns_2250_unique_scenarios():
    res = client.post("/timeout/precompute", json={"sport": "NFL"})
    assert res.status_code == 200
    body = res.json()
    assert body["sport"] == "NFL"
    assert body["count"] == 2250
    scenarios = body["scenarios"]
    assert len(scenarios) == 2250
    keys = {s["scenarioKey"] for s in scenarios}
    assert len(keys) == 2250  # unique per scenario
    for s in scenarios:
        assert 0.0 <= s["stopProbabilityWith"] <= 1.0
        assert 0.0 <= s["stopProbabilityWithout"] <= 1.0
        assert s["confidenceLevel"] in ("high", "medium", "low")
        assert s["computedAt"]
        assert s["consecutiveScores"] in (0, 1, 2, 3, 4)
        assert s["timeoutsAvailable"] in (1, 2, 3)


def test_precompute_covers_full_grid_dimensions():
    res = client.post("/timeout/precompute", json={"sport": "NBA"}).json()
    scenarios = res["scenarios"]
    assert {(s["consecutiveScores"], s["scoreDiff"], s["timeRemaining"], s["period"], s["timeoutsAvailable"])
            for s in scenarios} == {
        (c, d, t, p, to)
        for c in (0, 1, 2, 3, 4)
        for d in (-12, -6, -2, 0, 3, 8)
        for t in (30, 120, 240, 480, 720)
        for p in (1, 2, 3, 4, 5)
        for to in (1, 2, 3)
    }


def test_scenario_key_is_stable_and_sport_scoped():
    k1 = scenario_key("NFL", 2, -7, 90, 4, 2)
    k2 = scenario_key("NFL", 2, -7, 90, 4, 2)
    k3 = scenario_key("NBA", 2, -7, 90, 4, 2)
    assert k1 == k2
    assert k1 != k3
    assert len(k1) == 12


def _synthetic_training_rows(n: int = 600, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for _ in range(n):
        consecutive = rng.randint(0, 4)
        diff = rng.randint(-15, 15)
        time_left = rng.choice([30, 90, 150, 240, 480, 720])
        period = rng.randint(1, 5)
        to = rng.randint(0, 3)
        called = rng.randint(0, 1)
        prob = TimeoutModel.heuristic_stop_prob(bool(called), consecutive, diff, time_left, period, to)
        stop = 1 if rng.random() < prob else 0
        rows.append(
            {
                "consecutiveScores": consecutive,
                "scoreDiff": diff,
                "timeRemaining": time_left,
                "period": period,
                "timeoutsAvailable": to,
                "timeoutCalled": called,
                "stop": stop,
            }
        )
    return rows


def test_decision_tree_trains_and_recommends():
    """With training data available the tree path trains and must still rank
    the hot situation as timeout-worthy. Cache is cleaned up so later tests
    keep using the heuristic."""
    model_cache.clear()
    rows = _synthetic_training_rows()
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(rows, fh)
        path = fh.name
    os.environ["TIMEOUT_TRAINING_DATA"] = path

    try:
        model = TimeoutModel()  # fresh instance → trains from the env path
        res = model.recommend("NFL", 4, -9, 45.0, 4, 2)
        assert model._tree is not None  # noqa: SLF001 — assert the tree path was used
        assert res["stopProbabilityWith"] > res["stopProbabilityWithout"]
    finally:
        model_cache.clear()
        os.environ.pop("TIMEOUT_TRAINING_DATA", None)
        os.remove(path)
