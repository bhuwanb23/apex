# Tests for the momentum Cox module (Step 7).

import random

from fastapi.testclient import TestClient

from app.data.model_cache import model_cache
from app.main import app

client = TestClient(app)


def _build_game_plays(game_id: str, seed: int) -> list[dict]:
    """Deterministic scoring sequence engineered for significance: a home
    streak of 3 is always answered by the opponent with a SHORT gap, while
    within-streak scores have LONG gaps. So high `consecutive` strongly
    predicts 'opponent scores next, quickly' — the Cox model should find a
    significant positive hazard coefficient."""
    rng = random.Random(seed)
    seq: list[str] = []
    side = "home"
    while len(seq) < 12:
        streak = 3 if side == "home" else rng.choice([1, 2])
        seq.extend([side] * streak)
        side = "away" if side == "home" else "home"
    seq = seq[:12]

    plays = []
    t = 60.0
    home = away = 0
    for i, scorer in enumerate(seq):
        changed = i > 0 and scorer != seq[i - 1]
        t += rng.uniform(45, 95) if changed else rng.uniform(480, 620)
        if scorer == "home":
            home += 3
        else:
            away += 3
        plays.append(
            {
                "gameId": game_id,
                "eventTimeSeconds": round(t, 1),
                "teamId": f"{game_id}-{scorer}",
                "isScoring": True,
                "homeScore": home,
                "awayScore": away,
                "period": 1 + int(t // 900),
                # no description → the timeline's fallback text is exercised
            }
        )
    return plays


def _season_plays(game_count: int = 24, start_seed: int = 11) -> list[dict]:
    plays = []
    for g in range(game_count):
        plays.extend(_build_game_plays(f"game-{g:03d}", start_seed + g))
    return plays


def test_compute_season_insufficient_data():
    """Fewer than MIN_RECORDS survival records → null-risk verdict."""
    plays = _build_game_plays("game-001", 1)[:6]  # a handful of plays
    res = client.post(
        "/momentum/compute-season",
        json={"sport": "NFL", "season": "2024", "plays": plays},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["verdictLabel"] == "insufficient_data"
    assert body["hazardCoefficient"] is None
    assert body["isSignificant"] is False
    assert body["gamesAnalyzed"] == 1
    assert body["playsAnalyzed"] == len(plays)


def test_compute_season_finds_significant_momentum():
    """The engineered data (long streaks → quick opponent answers) must yield
    a significant positive hazard coefficient — i.e. momentum is real."""
    plays = _season_plays(game_count=24)
    res = client.post(
        "/momentum/compute-season",
        json={"sport": "NFL", "season": "2024", "plays": plays},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["verdictLabel"] == "significant"
    assert body["isSignificant"] is True
    assert body["hazardCoefficient"] is not None and body["hazardCoefficient"] > 0
    assert body["pValue"] is not None and body["pValue"] < 0.05
    assert body["effectSize"] is not None and body["effectSize"] > 1.0
    assert body["hazardRateChange"] is not None and body["hazardRateChange"] > 0
    assert body["gamesAnalyzed"] == 24
    assert body["playsAnalyzed"] == len(plays)
    assert "hazard" in body["plainExplanation"].lower()
    assert body["shortExplanation"]


def test_compute_season_random_noise_does_not_crash():
    """Random scoring data fits without crashing and returns a valid verdict."""
    rng = random.Random(99)
    plays = []
    for g in range(20):
        t = 60.0
        home = away = 0
        prev = None
        for i in range(10):
            scorer = "home" if rng.random() < 0.5 else "away"
            t += rng.uniform(30, 700)
            if scorer == "home":
                home += 3
            else:
                away += 3
            plays.append(
                {
                    "gameId": f"noise-{g:03d}",
                    "eventTimeSeconds": round(t, 1),
                    "teamId": f"t{i}",
                    "isScoring": True,
                    "homeScore": home,
                    "awayScore": away,
                    "period": 1 + int(t // 900),
                }
            )
            prev = scorer
    res = client.post(
        "/momentum/compute-season",
        json={"sport": "NBA", "season": "2024", "plays": plays},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["verdictLabel"] in ("significant", "not_significant")
    assert body["hazardCoefficient"] is not None
    assert 0.0 <= body["pValue"] <= 1.0


def test_compute_game_timeline_structure():
    """Timeline mirrors the scoring sequence: streaks, peaks, shifts."""
    plays = _build_game_plays("game-abc", 5)
    res = client.post("/momentum/compute-game", json={"gameId": "game-abc", "plays": plays})
    assert res.status_code == 200
    body = res.json()
    assert body["gameId"] == "game-abc"
    # Sequence starts home×3 → longest streak and peak are 3 (neutral weight).
    assert body["longestStreak"] == 3
    assert body["peakHomeMomentum"] == 3.0
    assert body["peakAwayMomentum"] == 2.0  # away streaks are 1 or 2
    assert body["momentumShifts"] > 0
    assert len(body["timelineEvents"]) == len(plays)
    assert len(body["homeTeamMomentum"]) == len(plays)
    assert body["timelineEvents"][2]["homeMomentumScore"] == 3.0
    assert "consecutive" in body["timelineEvents"][2]["eventDescription"]
    # Streaks reset: after the away answer (one or two events), the next
    # home score restarts home momentum at 1.
    away_idx = next(
        i for i, e in enumerate(body["timelineEvents"]) if e["homeMomentumScore"] == 0.0
    )
    home_after = next(
        e for e in body["timelineEvents"][away_idx + 1 :] if e["homeMomentumScore"] > 0
    )
    assert home_after["homeMomentumScore"] == 1.0


def test_compute_game_timeline_uses_cached_hazard_weight():
    """When a season model is cached for the sport, the timeline is weighted
    by its hazard ratio."""
    plays = _season_plays(game_count=12)
    season = client.post(
        "/momentum/compute-season",
        json={"sport": "NBA", "season": "2024", "plays": plays},
    ).json()
    hr = season["effectSize"]
    assert hr is not None and hr > 0

    single = _build_game_plays("weighted-game", 5)
    res = client.post(
        "/momentum/compute-game",
        json={"gameId": "weighted-game", "plays": single, "sport": "NBA"},
    )
    assert res.status_code == 200
    body = res.json()
    # Weight is the unrounded hazard ratio; response rounds to 3 decimals,
    # so compare with tolerance.
    assert abs(body["peakHomeMomentum"] - 3.0 * hr) < 0.01


def test_momentum_routes_registered():
    paths = set(client.get("/openapi.json").json()["paths"])
    assert "/momentum/compute-season" in paths
    assert "/momentum/compute-game" in paths
