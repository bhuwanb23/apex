# Step 12 — live verification of every Phase 4 endpoint (Tests 1-6).
#
# Usage:  .venv/Scripts/python.exe scripts/verify_endpoints.py [base_url]
# Default base_url: http://localhost:8001
#
# Prints PASS/FAIL per check and exits non-zero if anything fails. Test 7
# (Node ↔ Python integration) is a separate scripted run from the Node side —
# see backend/src tests / manual notes.

import json
import random
import sys
import urllib.request
from datetime import datetime, timedelta

# Windows consoles default to cp1252, which cannot print unicode arrows/dashes.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # noqa: PGH003

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"

FAILURES: list[str] = []


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def get(path: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:  # noqa: PERF203 — expected for 503s
        return exc.code, json.loads(exc.read())


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(name)


# ---------------------------------------------------------------------------
# Test 1 — Injury risk
# ---------------------------------------------------------------------------
print("\n== Test 1: Injury Risk ==")


def game_logs(days: int, minutes: float | list[float]) -> list[dict]:
    """`minutes` is indexed by recency: [0] = most recent game."""
    if isinstance(minutes, list):
        return [
            {
                "date": (datetime(2025, 2, 1) + timedelta(days=days - i)).date().isoformat(),
                "minutesPlayed": minutes[i],
            }
            for i in range(days)
        ]
    return [
        {
            "date": (datetime(2025, 2, 1) + timedelta(days=days - i)).date().isoformat(),
            "minutesPlayed": minutes,
        }
        for i in range(days)
    ]


# 1a. 28 logs = 21-day baseline + 7-day recent window (non-overlapping per the
# Step 5 design). The three most recent games (indices 0-2) spike hard.
logs = game_logs(
    28,
    [46.0, 44, 45, 31, 30, 29, 30, 31, 30, 29, 31, 30, 29, 30, 31, 30, 29, 31, 30, 29, 30, 31, 30, 29, 31, 30, 29, 31],
)
injury = post("/injury/compute-risk", {
    "playerId": "test-1",
    "playerName": "Test Player",
    "sport": "NBA",
    "gameLogs": logs,
})
check("score 0..100", 0 <= injury["riskScore"] <= 100, f"score={injury['riskScore']}")
check("zone valid", injury["zone"] in ("green", "yellow", "red"), f"zone={injury['zone']}")
check("explanation readable", len(injury["explanation"]) > 20, injury["explanation"][:70])
check("spike detected in recent window", injury["minutesZScore"] is not None and injury["minutesZScore"] > 1.5,
      f"z={injury['minutesZScore']}")
check("baseline uses 21 games", injury["dataPointsUsed"] == 21, f"n={injury['dataPointsUsed']}")

# 1b. Fewer than 5 games → graceful null risk.
few = post("/injury/compute-risk", {
    "playerId": "test-2", "playerName": "Few Games", "sport": "NBA",
    "gameLogs": game_logs(3, 25.0),
})
check("insufficient data handled", few["riskScore"] is None and few["zone"] == "insufficient_data",
      f"zone={few['zone']}")

# 1c. All identical minutes → z-score 0 → green.
flat = post("/injury/compute-risk", {
    "playerId": "test-3", "playerName": "Flat Player", "sport": "NBA",
    "gameLogs": game_logs(21, 30.0),
})
check("zero variance -> z-score 0", flat["minutesZScore"] == 0.0, f"z={flat['minutesZScore']}")
check("zero variance -> green", flat["zone"] == "green", f"zone={flat['zone']}")

# ---------------------------------------------------------------------------
# Test 2 — Decision EV
# ---------------------------------------------------------------------------
print("\n== Test 2: Decision EV ==")


def ev_4th(field_pos: int, ytg: int, score_diff: int, chosen: str, secs: int = 240) -> dict:
    return post("/decisions/compute-ev", {
        "sport": "NFL", "decisionType": "4th_down", "chosenAction": chosen,
        "gameContext": {"sport": "NFL", "scoreDiff": score_diff, "timeRemainingSeconds": secs,
                        "period": 4, "down": 4, "yardsToGo": ytg, "fieldPosition": field_pos,
                        "timeoutsRemaining": 2, "isHome": False},
        "availableActions": ["go", "punt", "field_goal"],
    })


# 2a. 4th and 1 from opponent 30 → go for it has the highest EV.
short = ev_4th(field_pos=30, ytg=1, score_diff=0, chosen="go")
best_short = max(short["allOptions"], key=lambda o: o["ev"])
check("4th&1 opp30 -> go is best", best_short["action"] == "go",
      f"best={best_short['action']} ev={best_short['ev']}")
check("isOptimal for go", short["isOptimal"] is True, f"isOptimal={short['isOptimal']}")

# 2b. 4th and 15 from own 20 → punt / FG higher EV than going for it.
long_d = ev_4th(field_pos=80, ytg=15, score_diff=0, chosen="punt")
evs = {o["action"]: o["ev"] for o in long_d["allOptions"]}
check("4th&15 own20 -> go is NOT best", max(evs, key=evs.get) in ("punt", "field_goal"),
      f"evs={evs}")

# 2c. All three NFL decision types produce full responses.
types = [
    ("4th_down", "go", {"down": 4, "yardsToGo": 2, "fieldPosition": 35},
     ["go", "punt", "field_goal"]),
    ("2pt_conversion", "two_point_attempt", {}, ["two_point_attempt", "extra_point"]),
    ("timeout", "call_timeout", {}, ["call_timeout", "let_clock_run"]),
]
for d_type, chosen, extra, actions in types:
    ctx = {"sport": "NFL", "scoreDiff": -3, "timeRemainingSeconds": 240, "period": 4,
           "timeoutsRemaining": 2, "isHome": False, **extra}
    res = post("/decisions/compute-ev", {
        "sport": "NFL", "decisionType": d_type, "chosenAction": chosen,
        "gameContext": ctx, "availableActions": actions,
    })
    check(f"{d_type} full response", all(k in res for k in ("evChosen", "evBest", "evDifference", "isOptimal", "allOptions")),
          f"chosen={res['evChosen']} best={res['evBest']}")

# ---------------------------------------------------------------------------
# Test 3 — Cox Momentum
# ---------------------------------------------------------------------------
print("\n== Test 3: Cox Momentum ==")


def build_plays(game_id: str, seed: int) -> list[dict]:
    rng = random.Random(seed)
    seq, side = [], "home"
    while len(seq) < 12:
        streak = 3 if side == "home" else rng.choice([1, 2])
        seq.extend([side] * streak)
        side = "away" if side == "home" else "home"
    seq = seq[:12]
    plays, t, home, away = [], 60.0, 0, 0
    for i, s in enumerate(seq):
        changed = i > 0 and s != seq[i - 1]
        t += rng.uniform(45, 95) if changed else rng.uniform(480, 620)
        if s == "home":
            home += 3
        else:
            away += 3
        plays.append({"gameId": game_id, "eventTimeSeconds": round(t, 1), "isScoring": True,
                      "homeScore": home, "awayScore": away, "period": 1 + int(t // 900)})
    return plays


# 3a. 100 games.
season_plays = [p for g in range(100) for p in build_plays(f"g{g:03d}", 1000 + g)]
season = post("/momentum/compute-season", {"sport": "NFL", "season": "2024", "plays": season_plays})
required = ("hazardCoefficient", "pValue", "confidenceIntervalLow", "confidenceIntervalHigh",
            "isSignificant", "effectSize", "gamesAnalyzed", "playsAnalyzed", "verdictLabel",
            "plainExplanation", "shortExplanation")
check("season runs, all fields", all(k in season for k in required))
check("p-value 0..1", 0.0 <= season["pValue"] <= 1.0, f"p={season['pValue']}")
check("explanation generated", len(season["plainExplanation"]) > 30, season["verdictLabel"])
check("games counted", season["gamesAnalyzed"] == 100, f"games={season['gamesAnalyzed']}")

# 3b. Single game timeline — entry for each scoring event.
single = post("/momentum/compute-game", {"gameId": "g000", "plays": build_plays("g000", 1000)})
scoring_events = sum(1 for p in build_plays("g000", 1000) if p["isScoring"])
check("timeline entry per scoring event", len(single["timelineEvents"]) == scoring_events,
      f"events={len(single['timelineEvents'])}/{scoring_events}")
check("timeline fields", all(k in single for k in ("peakHomeMomentum", "peakAwayMomentum",
                                                   "momentumShifts", "longestStreak")))

# ---------------------------------------------------------------------------
# Test 4 — Timeout Optimizer
# ---------------------------------------------------------------------------
print("\n== Test 4: Timeout Optimizer ==")

pre = post("/timeout/precompute", {"sport": "NBA"})
check("precompute 2250 scenarios", pre["count"] == 2250 and len(pre["scenarios"]) == 2250,
      f"count={pre['count']}")

# 4b. Specific scenario: 3 consecutive opponent scores, down 2, 2:00 left, 4th qtr.
situation = {
    "sport": "NBA", "consecutiveScores": 3, "scoreDiff": -2,
    "timeRemaining": 120.0, "period": 4, "timeoutsAvailable": 2,
}
rec = post("/timeout/recommend", situation)
check("hot late-game scenario -> call timeout", rec["shouldCallTimeout"] is True,
      f"diff={rec['probabilityDiff']} ({rec['confidenceLevel']})")
check("rec text explains", "timeout" in rec["recommendationText"].lower())
# Same situation must exist in the precomputed grid.
grid_match = any(
    s["consecutiveScores"] == 3 and s["scoreDiff"] == -2 and s["timeRemaining"] == 120
    and s["period"] == 4 and s["timeoutsAvailable"] == 2
    for s in pre["scenarios"]
)
check("scenario present in grid", grid_match)

# ---------------------------------------------------------------------------
# Test 5 — Story Generator
# ---------------------------------------------------------------------------
print("\n== Test 5: Story Generator ==")

injury_metrics = {"zone": "red", "riskScore": 85, "triggerMetric": "minutes",
                  "percentageAbove": 26, "windowDays": 7}
trainer = post("/story/generate", {"module": "injury", "sport": "NBA", "role": "trainer",
                                   "entityName": "Test Player", "metrics": injury_metrics})
fan = post("/story/generate", {"module": "injury", "sport": "NBA", "role": "fan",
                               "entityName": "Test Player", "metrics": injury_metrics})
check("trainer story readable", len(trainer["storyText"]) > 40, trainer["headlineText"])
check("fan story simpler", len(fan["storyText"]) < len(trainer["storyText"]),
      f"trainer={len(trainer['storyText'])}c fan={len(fan['storyText'])}c")
check("tone + generatedBy", trainer["toneLabel"] in ("warning", "positive", "neutral")
      and trainer["generatedBy"] in ("template", "openai"))

# 5c/d. OpenAI key path is environment-dependent: without a key the server must
# fall back to templates (never fail). With a key configured it returns openai.
no_key = post("/story/generate", {"module": "momentum", "sport": "NFL", "role": "analyst",
                                  "metrics": {"verdictLabel": "significant", "pValue": 0.02,
                                              "hazardRateChange": 8.0, "gamesAnalyzed": 40,
                                              "season": "2024"}})
check("analyst falls back to template", no_key["generatedBy"] == "template", no_key["generatedBy"])

# ---------------------------------------------------------------------------
# Test 6 — NFL Bridge
# ---------------------------------------------------------------------------
print("\n== Test 6: NFL Bridge ==")

status, body = get("/nfl/plays?season=2023&week=1")
if status == 503:
    check("nfl_data_py absent → graceful 503 (data cleaning path is unit-tested)",
          "nfl_data_py" in body["detail"], body["detail"][:60])
else:
    plays = body.get("plays", [])
    check("plays returned", isinstance(plays, list) and len(plays) > 0, f"n={len(plays)}")
    nan_free = all(not (isinstance(v, float) and v != v) for p in plays for v in p.values())
    check("no NaN values", nan_free)

print(f"\n{'=' * 60}\nRESULT: {len(FAILURES)} failure(s) across Tests 1-6")
for name in FAILURES:
    print(f"  FAIL: {name}")
sys.exit(1 if FAILURES else 0)
