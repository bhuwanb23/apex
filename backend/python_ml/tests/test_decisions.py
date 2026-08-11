# Tests for the decision EV module (Step 6).

from fastapi.testclient import TestClient

from app.main import app
from app.models.decision_model import DecisionEVModel, heuristic_win_prob

client = TestClient(app)

# Spec Step 6.2 example: 4th and 2 from the opponent 35, down 3, 4 minutes left.
FOURTH_DOWN_CTX = {
    "sport": "NFL",
    "scoreDiff": -3,
    "timeRemainingSeconds": 240.0,
    "period": 4,
    "down": 4,
    "yardsToGo": 2,
    "fieldPosition": 35,  # opponent 35 yard line (35 yards to opponent goal)
    "timeoutsRemaining": 2,
    "isHome": False,
}


# --- API endpoint -------------------------------------------------------------


def test_compute_ev_4th_down():
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NFL",
            "decisionType": "4th_down",
            "chosenAction": "go",
            "gameContext": FOURTH_DOWN_CTX,
            "availableActions": ["go", "punt", "field_goal"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["evBest"] >= body["evChosen"] - 1e-9
    assert body["evDifference"] >= -1e-9
    assert 0 <= body["winProbBefore"] <= 1
    assert isinstance(body["isOptimal"], bool)
    assert len(body["allOptions"]) == 3
    for opt in body["allOptions"]:
        assert {"action", "ev", "probSuccess", "wpIfSuccess", "wpIfFailure"} <= set(opt)
        assert 0 <= opt["probSuccess"] <= 1
    assert body["explanation"].startswith("4th and 2")


def test_compute_ev_2pt():
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NFL",
            "decisionType": "2pt_conversion",
            "chosenAction": "two_point_attempt",
            "gameContext": {"sport": "NFL", "scoreDiff": -2, "timeRemainingSeconds": 30.0, "period": 4},
            "availableActions": ["two_point_attempt", "extra_point"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["allOptions"]) == 2
    actions = {opt["action"]: opt for opt in body["allOptions"]}
    assert "two_point_attempt" in actions and "extra_point" in actions


def test_compute_ev_nba_foul_up_three():
    """Analytics insight (Step 6.3): don't foul is the higher-EV play up 3."""
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NBA",
            "decisionType": "foul_strategy",
            "chosenAction": "foul",
            "gameContext": {"sport": "NBA", "scoreDiff": 3, "timeRemainingSeconds": 8.0, "period": 4},
            "availableActions": ["foul", "no_foul"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    by_action = {opt["action"]: opt["ev"] for opt in body["allOptions"]}
    assert by_action["no_foul"] > by_action["foul"], "analytics: don't foul when up 3"
    assert body["evBest"] == by_action["no_foul"]
    assert "fouling" in body["explanation"].lower()


def test_compute_ev_nba_shot_selection():
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NBA",
            "decisionType": "shot_selection",
            "chosenAction": "three_point",
            "gameContext": {"sport": "NBA", "scoreDiff": -2, "timeRemainingSeconds": 45.0, "period": 4},
            "availableActions": ["at_rim", "mid_range", "three_point"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    by_action = {opt["action"]: opt["ev"] for opt in body["allOptions"]}
    assert by_action["at_rim"] == round(2 * 0.62, 4)  # expected points
    assert by_action["mid_range"] == round(2 * 0.42, 4)
    assert by_action["three_point"] == round(3 * 0.36, 4)


def test_compute_ev_validates_bad_payload():
    res = client.post("/decisions/compute-ev", json={})
    assert res.status_code == 422


# --- Model unit tests ---------------------------------------------------------


def test_heuristic_win_prob_direction():
    # Trailing late is bad, leading late is good.
    assert heuristic_win_prob(-7, 120, has_ball=True) < 0.5
    assert heuristic_win_prob(7, 120, has_ball=True) > 0.5
    # A bigger deficit is worse than a smaller one.
    assert heuristic_win_prob(-10, 300) < heuristic_win_prob(-3, 300)
    # Possession helps.
    assert heuristic_win_prob(-3, 300, has_ball=True) > heuristic_win_prob(-3, 300, has_ball=False)
    # Closer to the opponent goal (lower fieldPosition) is better.
    assert heuristic_win_prob(-3, 300, has_ball=True, field_position=35) > heuristic_win_prob(
        -3, 300, has_ball=True, field_position=70
    )


def test_heuristic_win_prob_bounds():
    for diff in (-21, -7, 0, 3, 14):
        wp = heuristic_win_prob(diff, 600, has_ball=True)
        assert 0 < wp < 1


def test_wp_model_train_roundtrip(tmp_path, monkeypatch):
    """Training the logistic regression must fit, save a joblib, and load back."""
    import numpy as np

    monkeypatch.setenv("WP_MODEL_PATH", str(tmp_path / "wp_model.joblib"))
    from app.models.decision_model import WinProbabilityModel

    rng = np.random.default_rng(7)
    samples = []
    for _ in range(800):
        diff = float(rng.integers(-14, 15))
        time_left = float(rng.integers(10, 3600))
        has_ball = bool(rng.integers(0, 2))
        outcome = 1 if (rng.random() < heuristic_win_prob(diff, time_left, has_ball)) else 0
        samples.append(
            {
                "score_diff": diff,
                "time_remaining": time_left,
                "is_home": True,
                "has_ball": has_ball,
                "down": 1,
                "field_position": 50.0,
                "timeouts": 2,
                "period": 3,
                "outcome": outcome,
            }
        )

    wpm = WinProbabilityModel()
    result = wpm.train(samples)
    assert result["accuracy"] > 0.5
    assert result["samples"] == 800
    assert (tmp_path / "wp_model.joblib").exists()

    # Fresh instance loads from disk via ensure_loaded.
    wpm2 = WinProbabilityModel()
    assert wpm2.ensure_loaded() is not None
    pred = wpm2.predict({"score_diff": 7, "time_remaining": 300, "is_home": True, "has_ball": True})
    assert 0 < pred < 1

    # Cleanup: drop the trained model from the shared cache so later tests
    # keep using the deterministic heuristic instead of this synthetic model.
    from app.data.model_cache import model_cache

    model_cache.remove("wp_model")


def test_compute_ev_timeout():
    """Calling a timeout late while trailing should carry positive EV."""
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NFL",
            "decisionType": "timeout",
            "chosenAction": "call_timeout",
            "gameContext": {"sport": "NFL", "scoreDiff": -3, "timeRemainingSeconds": 30.0, "period": 4},
            "availableActions": ["call_timeout", "let_clock_run"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    by_action = {opt["action"]: opt["ev"] for opt in body["allOptions"]}
    assert by_action["call_timeout"] > by_action["let_clock_run"]


def test_compute_ev_2pt_trailing_late_prefers_attempt():
    """Down 2 late: going for 2 (up 2 on success) beats the extra point (up 1)."""
    res = client.post(
        "/decisions/compute-ev",
        json={
            "sport": "NFL",
            "decisionType": "2pt_conversion",
            "chosenAction": "two_point_attempt",
            "gameContext": {"sport": "NFL", "scoreDiff": -2, "timeRemainingSeconds": 30.0, "period": 4},
            "availableActions": ["two_point_attempt", "extra_point"],
        },
    )
    assert res.status_code == 200
    body = res.json()
    by_action = {opt["action"]: opt["ev"] for opt in body["allOptions"]}
    assert by_action["two_point_attempt"] > by_action["extra_point"]


def test_fourth_down_tables():
    from app.models.decision_model import _fourth_down_success, _fg_success

    assert _fourth_down_success(1, 70) == 0.68  # spec: 4th and 1 from own 30
    assert _fourth_down_success(5, 20) == 0.41  # spec: 4th and 5 from opp 20
    assert _fg_success(42) == 0.78  # spec: 40-44 yards
    assert _fg_success(52) == 0.63  # spec: 50-54 yards
