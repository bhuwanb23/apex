# Tests for the momentum Cox module (Step 7 fills the real model logic).

from fastapi.testclient import TestClient

from app.main import app
from app.utils.stats_helpers import percentile

client = TestClient(app)

SAMPLE_EVENTS = [
    {"period": 1, "gameTimeSeconds": 600, "isScoring": False, "scoreDiff": 0},
    {"period": 1, "gameTimeSeconds": 700, "isScoring": True, "scoringTeam": "home", "scoreDiff": 3},
    {"period": 2, "gameTimeSeconds": 1300, "isScoring": True, "scoringTeam": "away", "scoreDiff": 0},
]


def test_momentum_game_endpoint_returns_501_until_model_implemented():
    res = client.post("/momentum/game", json={"gameId": "401671760", "events": SAMPLE_EVENTS})
    assert res.status_code == 501  # NotImplementedError → "lands in Step 7"


def test_momentum_season_endpoint_returns_501_until_model_implemented():
    res = client.post(
        "/momentum/season",
        json={"sport": "nfl", "season": "2024", "games": []},
    )
    assert res.status_code == 501


def test_percentile_math():
    values = [10.0, 20.0, 30.0]
    assert percentile(values, 0) == 10.0
    assert percentile(values, 50) == 20.0
    assert percentile(values, 100) == 30.0
