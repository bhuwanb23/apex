# Step 3 verification — routers registered, CORS configured, docs available.

from fastapi.testclient import TestClient

from app.main import ALLOWED_ORIGINS, app

client = TestClient(app)


def test_all_routers_registered():
    paths = set(client.get("/openapi.json").json()["paths"])
    for expected in [
        "/health",
        "/injury/score",
        "/decisions/ev",
        "/momentum/game",
        "/momentum/season",
        "/timeout/recommend",
        "/story/generate",
        "/nfl/plays",
        "/nfl/schedule",
    ]:
        assert expected in paths, f"missing route {expected}"


def test_docs_available():
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200


def test_cors_allowed_origins():
    assert "http://localhost:8000" in ALLOWED_ORIGINS  # Node backend
    assert "http://localhost:3000" in ALLOWED_ORIGINS  # frontend


def test_unknown_route_404():
    assert client.get("/nope").status_code == 404
