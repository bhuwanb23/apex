# Tests for the decision EV module (Step 6 fills the real model logic).

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_CONTEXT = {
    "sport": "nfl",
    "scoreDiff": -7,
    "secondsRemaining": 2030.0,
    "period": 3,
    "down": 4,
    "yardsToGo": 7,
    "yardLine": 78,
}


def test_decision_ev_endpoint_returns_501_until_model_implemented():
    res = client.post(
        "/decisions/ev",
        json={
            "decisionType": "4th_down",
            "chosenAction": "go",
            "context": SAMPLE_CONTEXT,
        },
    )
    assert res.status_code == 501  # NotImplementedError → "lands in Step 6"


def test_decision_ev_validates_bad_payload():
    res = client.post("/decisions/ev", json={"decisionType": "4th_down"})
    assert res.status_code == 422
