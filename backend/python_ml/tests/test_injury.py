# Tests for the injury risk module (Step 5).

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models.injury_model import InjuryRiskModel, _zone_for_score, metric_points
from app.utils.stats_helpers import mean, std_dev, z_score

client = TestClient(app)
model = InjuryRiskModel()

# Day offsets (negative = days before the most recent game, which anchors windows)
def log(days_ago: int, **kw) -> dict:
    base = {"date": (date(2025, 3, 20) - timedelta(days=days_ago)).isoformat()}
    base.update(kw)
    return base


# --- API endpoint -------------------------------------------------------------


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "AQX ML Microservice"


def test_compute_risk_endpoint_spike():
    """A minutes spike over a consistent baseline must land in yellow/red."""
    # Slight natural variance in the baseline (real workloads vary game to game)
    games = [log(d, minutesPlayed=m) for d, m in zip((21, 19, 17, 15, 13, 11, 9, 7), (30, 31, 29, 30, 31, 29, 30, 31))]
    games += [log(3, minutesPlayed=46), log(1, minutesPlayed=44)]
    res = client.post(
        "/injury/compute-risk",
        json={
            "playerId": "1628983",
            "playerName": "LeBron James",
            "sport": "NBA",
            "gameLogs": games,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["zone"] in ("yellow", "red")
    assert body["riskScore"] > 33
    assert body["triggerMetric"] == "minutes"
    assert body["minutesZScore"] > 1.5
    assert body["dataPointsUsed"] >= 5
    assert "LeBron James has played" in body["explanation"]
    assert body["explanation"].startswith(("HIGH RISK: ", "ELEVATED RISK: "))


def test_compute_risk_endpoint_insufficient_data():
    res = client.post(
        "/injury/compute-risk",
        json={"playerId": "x", "gameLogs": [log(1, minutesPlayed=30), log(2, minutesPlayed=31)]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["zone"] == "insufficient_data"
    assert body["riskScore"] is None
    assert body["dataPointsUsed"] < 5
    assert "Not enough game log data" in body["explanation"]


def test_compute_risk_endpoint_normal():
    """Consistent workload → green zone, no trigger."""
    # Realistic every-other-day schedule: 4 games in the recent 7-day window
    # (not > 4, so no high-volume flag), all with identical workload.
    games = [
        log(d, minutesPlayed=30, distanceCovered=3.0, highIntensityEvents=40)
        for d in (21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1)
    ]
    res = client.post(
        "/injury/compute-risk",
        json={"playerId": "y", "gameLogs": games},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["zone"] == "green"
    assert body["riskScore"] <= 33
    assert body["triggerMetric"] is None
    assert body["explanation"].startswith("Normal workload:")


def test_compute_risk_validates_bad_payload():
    res = client.post("/injury/compute-risk", json={})  # missing playerId + gameLogs
    assert res.status_code == 422


# --- Model unit tests (spec example numbers) -----------------------------------


def test_zscore_spec_example():
    # Spec Step 5.3 example: baseline mean 28.5, std 3.2, recent avg 36.1 → z = 2.375
    assert abs(z_score(36.1, 28.5, 3.2) - 2.375) < 1e-9


def test_metric_points_scale():
    # Spec: z-score > 1.5 flags — at exactly 1.5 there are no points yet.
    assert metric_points(1.5, 40) == 0.0
    assert metric_points(2.0, 40) == 30.0  # z 2.0 → 30 of 40
    assert metric_points(2.375, 40) > 30.0  # spec example z → above the 2.0 mark
    assert metric_points(2.0, 25) == 18.75  # distance: same scale, max 25
    assert metric_points(2.0, 20) == 15.0  # intensity: same scale, max 20
    assert metric_points(0.5, 40) == 0.0  # below threshold → 0
    assert metric_points(None, 40) == 0.0
    assert metric_points(4.0, 40) == 40.0  # capped at max


def test_back_to_back_adds_penalty():
    games = [log(d, minutesPlayed=30) for d in (21, 19, 17, 15, 13, 11, 9)]
    games += [log(3, minutesPlayed=30, backToBack=True, daysRestBefore=1), log(1, minutesPlayed=30)]
    res = model.compute("p", games)
    assert res["zone"] == "green"
    assert res["backToBackFlag"] is True
    assert res["triggerMetric"] == "backToBack"
    # 10 flat penalty alone stays green (0-33), but explanation mentions it
    assert "played back to back games on" in res["explanation"]


def test_zone_boundaries():
    # Spec Step 5.4 buckets: 0-33 green, 34-66 yellow, 67-100 red
    assert _zone_for_score(0) == "green"
    assert _zone_for_score(33) == "green"
    assert _zone_for_score(34) == "yellow"
    assert _zone_for_score(66) == "yellow"
    assert _zone_for_score(67) == "red"
    assert _zone_for_score(100) == "red"


def test_mean_std_helpers():
    values = [10.0, 12.0, 14.0]
    assert mean(values) == 12.0
    assert abs(std_dev(values, sample=True) - 2.0) < 1e-9
    assert std_dev([5.0], sample=True) == 0.0
