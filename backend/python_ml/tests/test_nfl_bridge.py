# Tests for the NFL data bridge (Step 10).
#
# nfl_data_py is not installed in this environment (pandas<2.0 pin vs
# Python 3.13), so every test drives a fake module through the same code path.

import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.data import nfl_bridge as bridge
from app.data.nfl_bridge import NflDataUnavailableError, _clean, fetch_season_plays
from app.main import app

client = TestClient(app)


class FakeNflDataPy:
    """Minimal stand-in for nfl_data_py that returns DataFrames WITH NaN."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def import_pbp(self, **kwargs):
        self.calls.append(("pbp", kwargs))
        return pd.DataFrame(
            {
                "game_id": ["2024_01_CIN_CLE", "2024_01_CIN_CLE", "2024_01_CIN_CLE"],
                "desc": ["pass complete", None, "rush"],
                "epa": [0.5, float("nan"), -0.2],
                "week": [1, 1, 1],
                "home_team": ["CIN", "CIN", "CIN"],
            }
        )

    def import_rosters(self, **kwargs):
        self.calls.append(("rosters", kwargs))
        return pd.DataFrame(
            {"player_id": [1, 2], "player_name": ["Joe Burrow", None], "team": ["CIN", "CIN"]}
        )

    def import_schedules(self, **kwargs):
        self.calls.append(("schedule", kwargs))
        return pd.DataFrame({"game_id": ["2024_01_CIN_CLE"], "week": [1]})


@pytest.fixture()
def fake(monkeypatch):
    fake_module = FakeNflDataPy()
    monkeypatch.setattr(bridge, "_nfl_data_py", fake_module)
    return fake_module


def test_clean_converts_nan_to_none_and_is_json_safe():
    df = pd.DataFrame({"a": [1.0, float("nan")], "b": ["x", None], "c": [float("nan"), 3.0]})
    records = _clean(df)
    assert records[0]["a"] == 1.0
    assert records[0]["b"] == "x"
    assert records[1]["a"] is None  # NaN → None
    assert records[1]["b"] is None
    assert records[0]["c"] is None
    json.dumps(records)  # must never raise (the critical JSON contract)


def test_clean_empty_frame_returns_empty_list():
    assert _clean(None) == []
    assert _clean(pd.DataFrame()) == []


def test_fetch_season_plays_cleans_and_passes_filters(fake):
    plays = fetch_season_plays(2024, week=1, team="CIN")
    assert fake.calls[0][0] == "pbp"
    assert fake.calls[0][1] == {"seasons": [2024], "weeks": [1], "teams": ["CIN"]}
    assert len(plays) == 3
    assert plays[1]["epa"] is None  # NaN cleaned
    assert plays[1]["desc"] is None
    json.dumps(plays)


def test_fetch_season_plays_no_filters(fake):
    fetch_season_plays(2024)
    assert fake.calls[0][1] == {"seasons": [2024], "weeks": None, "teams": None}


def test_fetch_rosters_and_schedule(fake):
    rosters = bridge.fetch_rosters(2024)
    assert fake.calls[0][0] == "rosters"
    assert fake.calls[0][1] == {"seasons": [2024]}
    assert rosters[1]["player_name"] is None

    schedule = bridge.fetch_schedule(2024)
    assert fake.calls[1][0] == "schedule"
    assert schedule[0]["game_id"] == "2024_01_CIN_CLE"


def test_unavailable_raises_clean_error(monkeypatch):
    """Unavailable only when BOTH nfl_data_py AND the local dataset are gone."""
    monkeypatch.setattr(bridge, "_nfl_data_py", False)
    monkeypatch.setattr(bridge, "_local_dataset", lambda name: None)
    assert bridge.is_available() is False
    with pytest.raises(NflDataUnavailableError):
        fetch_season_plays(2024)


def test_local_dataset_fallback_when_library_missing(monkeypatch):
    """With nfl_data_py missing but the local dataset present, data is served."""
    monkeypatch.setattr(bridge, "_nfl_data_py", False)
    assert bridge.is_available() is True  # local fallback keeps the bridge live
    plays = fetch_season_plays(2025)
    assert isinstance(plays, list)
    assert plays, "local dataset should contain plays"
    for field in ("game_id", "desc", "play_type"):
        assert field in plays[0]


def test_get_plays_endpoint(fake):
    res = client.get("/nfl/plays", params={"season": 2024, "week": 1, "team": "CIN"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["plays"]) == 3
    assert body["plays"][1]["epa"] is None  # NaN → null over the wire


def test_get_rosters_endpoint(fake):
    res = client.get("/nfl/rosters", params={"season": 2024})
    assert res.status_code == 200
    assert len(res.json()["rosters"]) == 2


def test_get_schedules_endpoint(fake):
    res = client.get("/nfl/schedules", params={"season": 2024})
    assert res.status_code == 200
    assert res.json()["schedule"][0]["week"] == 1


def test_post_plays_endpoint_single_game_filter(fake):
    res = client.post("/nfl/plays", json={"season": 2024, "game_id": "2024_01_CIN_CLE"})
    assert res.status_code == 200
    assert len(res.json()["plays"]) == 3  # all rows match the fake's game_id


def test_endpoints_return_503_when_all_sources_missing(monkeypatch):
    """503 only when nfl_data_py AND the local dataset are both unavailable."""
    monkeypatch.setattr(bridge, "_nfl_data_py", False)
    monkeypatch.setattr(bridge, "_local_dataset", lambda name: None)
    for method, url, kwargs in [
        ("get", "/nfl/plays", {"params": {"season": 2024}}),
        ("get", "/nfl/rosters", {"params": {"season": 2024}}),
        ("get", "/nfl/schedules", {"params": {"season": 2024}}),
        ("post", "/nfl/plays", {"json": {"season": 2024}}),
        ("post", "/nfl/schedule", {"json": {"season": 2024}}),
    ]:
        res = client.request(method, url, **kwargs)
        assert res.status_code == 503, f"{method} {url} should be 503"
        assert "nfl_data_py" in res.json()["detail"]
