# Tests for the story mode generator (Step 9).

import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _generate(module, role, metrics, sport="NFL", name=None):
    payload = {"module": module, "sport": sport, "role": role, "metrics": metrics}
    if name:
        payload["entityName"] = name
    res = client.post("/story/generate", json=payload)
    assert res.status_code == 200
    return res.json()


def test_injury_trainer_red_zone_template():
    body = _generate(
        "injury",
        "trainer",
        {
            "zone": "red",
            "riskScore": 85,
            "triggerMetric": "minutes",
            "percentageAbove": 26,
            "windowDays": 7,
        },
        name="LeBron James",
    )
    assert body["generatedBy"] == "template"
    assert body["toneLabel"] == "warning"
    assert body["headlineText"] == "High injury risk: LeBron James"
    assert "high risk" in body["storyText"]
    assert "85/100" in body["storyText"]
    assert "26%" in body["storyText"]
    assert "Consider reducing minutes or rest day" in body["storyText"]
    assert body["keyMetrics"]["zone"] == "red"


def test_injury_trainer_green_zone_normal():
    body = _generate(
        "injury",
        "trainer",
        {"zone": "green", "riskScore": 22, "triggerMetric": "minutes", "percentageAbove": 4, "windowDays": 7},
        name="Jaylen Brown",
    )
    assert body["toneLabel"] == "neutral"
    assert body["headlineText"] == "Workload check: Jaylen Brown"
    assert "Workload within normal range" in body["storyText"]


def test_injury_fan_simple_template():
    body = _generate(
        "injury",
        "fan",
        {"zone": "yellow", "riskScore": 45},
        name="Jaylen Brown",
    )
    assert "out of 100" in body["storyText"]
    assert "elevated risk" in body["storyText"]
    assert "more than usual lately" in body["storyText"]


def test_decisions_coach_template():
    body = _generate(
        "decisions",
        "coach",
        {
            "evRate": 72,
            "rank": 3,
            "totalCoaches": 32,
            "bestGameDate": "December 8",
            "bestDecisionDesc": "going for it on 4th and 1",
        },
        name="Zac Taylor",
    )
    assert body["toneLabel"] == "positive"
    assert body["headlineText"] == "Zac Taylor winning the decision battle"
    assert "72%" in body["storyText"]
    assert "ranking 3 out of 32" in body["storyText"]
    assert "NFL" in body["storyText"]
    assert "December 8" in body["storyText"]
    assert "going for it on 4th and 1" in body["storyText"]


def test_decisions_coach_low_ev_rate_warning():
    body = _generate(
        "decisions",
        "coach",
        {"evRate": 34, "rank": 28, "totalCoaches": 32},
        name="Matt Eberflus",
    )
    assert body["toneLabel"] == "warning"
    assert body["headlineText"] == "Matt Eberflus leaving wins on the table"


def test_momentum_analyst_significant_template():
    body = _generate(
        "momentum",
        "analyst",
        {
            "verdictLabel": "significant",
            "hazardRateChange": 327.5,
            "pValue": 0.0002,
            "gamesAnalyzed": 20,
            "season": "2024",
        },
        sport="NFL",
    )
    assert body["toneLabel"] == "positive"
    assert "momentum is real" in body["storyText"]
    assert "327.5%" in body["storyText"]
    assert "statistically significant" in body["storyText"]
    assert "20 games" in body["storyText"]
    assert "Momentum report: NFL 2024" == body["headlineText"]


def test_momentum_analyst_not_significant_template():
    body = _generate(
        "momentum",
        "analyst",
        {"verdictLabel": "not_significant", "hazardRateChange": 2.1, "pValue": 0.34, "gamesAnalyzed": 40, "season": "2023"},
    )
    assert body["toneLabel"] == "neutral"
    assert "a statistical myth" in body["storyText"]
    assert "not statistically significant" in body["storyText"]


def test_unknown_module_falls_back_to_generic():
    body = _generate("coaches", "analyst", {"wins": 9, "losses": 3}, name="Some Coach")
    assert body["generatedBy"] == "template"
    assert body["toneLabel"] == "neutral"
    assert "coaches" in body["storyText"]
    assert body["storyText"]


def test_missing_metrics_never_crashes():
    body = _generate("injury", "trainer", {})
    assert body["storyText"]
    assert body["generatedBy"] == "template"


def test_analyst_role_uses_template_without_api_key():
    """No OPENAI_API_KEY in the environment → analyst stories come from
    templates (never fail, never cost money)."""
    os.environ.pop("OPENAI_API_KEY", None)
    body = _generate("momentum", "analyst", {"verdictLabel": "significant"}, sport="NBA")
    assert body["generatedBy"] == "template"


def test_key_metrics_echo_omits_internal_keys():
    body = _generate("momentum", "analyst", {"verdictLabel": "significant", "gamesAnalyzed": 10})
    assert "_module" not in body["keyMetrics"]
    assert body["keyMetrics"]["verdictLabel"] == "significant"
