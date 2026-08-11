# Tests for the injury risk module (Step 5 fills the real model logic).

from fastapi.testclient import TestClient

from app.main import app
from app.utils.stats_helpers import mean, std_dev, z_score

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "AQX ML Microservice"


def test_injury_score_endpoint_returns_501_until_model_implemented():
    res = client.post(
        "/injury/score",
        json={
            "playerId": "1628983",
            "gameLogs": [{"date": "2025-03-10", "minutesPlayed": 38.5}],
        },
    )
    assert res.status_code == 501  # NotImplementedError → "lands in Step 5"


def test_injury_score_validates_bad_payload():
    res = client.post("/injury/score", json={"playerId": "1"})  # missing gameLogs
    assert res.status_code == 422


def test_z_score_math():
    assert z_score(15.0, 10.0, 2.5) == 2.0
    assert z_score(10.0, 10.0, 2.5) == 0.0
    assert z_score(10.0, 10.0, 0.0) == 0.0  # no baseline spread → no flag


def test_mean_std():
    values = [10.0, 12.0, 14.0]
    assert mean(values) == 12.0
    assert abs(std_dev(values, sample=True) - 2.0) < 1e-9
    assert std_dev([5.0], sample=True) == 0.0
