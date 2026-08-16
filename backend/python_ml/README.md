# Apex ML Microservice

Python FastAPI service that runs all heavy statistical / ML work for Apex Sports Intelligence.
Node.js (port 8000) calls this service (port 8001) over HTTP and stores the results in SQLite.

## Why Python

- **scikit-learn** — best ML library available
- **lifelines** — the only good Cox hazard model library
- **scipy** — statistical tests
- **numpy / pandas** — data science standard

## Quick start (venv only — no global packages)

```bash
cd backend/python_ml
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

- Health check: http://localhost:8001/health
- Swagger docs: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## Architecture

```
Node.js (8000)  ──HTTP/JSON──▶  FastAPI (8001)  ──▶  models
                                   │
                                   └── in-memory model cache (trained models)
```

Node calls Python for: injury risk scores, decision EV, Cox momentum, timeout
recommendations, story text, and NFL play-by-play (nfl_data_py bridge).
Node keeps: database, caching, API routing, and sports-API fetching.

## Project layout

```
app/
├── main.py          FastAPI entry point (CORS, routers, /health, warmup)
├── routers/         injury, decisions, momentum, timeout, story, nfl_data
├── models/          model implementations (steps 5-9)
├── schemas/         Pydantic request/response shapes
├── data/            nfl_data_py bridge + model cache + sample data
└── utils/           stats helpers, logger, validators
tests/               pytest suites
```

## Routes

| Prefix      | Purpose                                      |
| ----------- | -------------------------------------------- |
| `/injury`   | Z-score injury risk (POST /compute-risk)     |
| `/decisions`| Decision EV / win probability (POST /compute-ev) |
| `/momentum` | Cox hazard + game timelines (POST /compute-season, /compute-game) |
| `/timeout`  | Timeout optimizer (POST /recommend, /precompute) |
| `/story`    | Story mode text (POST /generate)             |
| `/nfl`      | nfl_data_py bridge (GET /plays, /rosters, /schedules + POST /plays, /schedule) |
| `/health`   | Liveness + model readiness (see below)       |

## Health endpoint

`GET /health` reports `status`, `environment`, a `models` map with
`loaded` / `not loaded` flags per model, `nflDataAvailable`, and a `timestamp`.

- `wpModel` / `momentumModel` / `timeoutModel` report `loaded` when a trained
  artifact is in the model cache (otherwise the endpoint still works via
  heuristic / rule fallbacks).
- `decisionModel` is always `loaded` — its lookup tables are embedded in code,
  no artifact required.
- `nflDataAvailable` is `false` when `nfl_data_py` is not installed
  (the /nfl routes then return clean `503`s; see below).
