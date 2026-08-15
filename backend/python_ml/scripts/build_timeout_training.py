"""One-off build script — generates timeout decision-tree training data.

Real timeout play-by-play events in the DB are TV timeouts (timeout_team is
null and outcomeSuccess is never recorded), so there is no supervised label
source. Instead we generate the full 2250-scenario grid (5 consecutiveScores
x 6 scoreDiff x 5 timeRemaining x 5 period x 3 timeoutsAvailable) and label
each row by sampling from the calibrated, explainable heuristic rule set
(app.models.timeout_model.heuristic_stop_prob) — the documented fallback the
model degrades to. The tree then learns the same counterfactual comparison
(with vs without a timeout) that the heuristic encodes, and /health reports
the model as loaded.

Output: app/data/training/timeout_training.json — {"records": [...]}
Run from python_ml/:  .venv/Scripts/python.exe scripts/build_timeout_training.py
"""

import json
import random
import sys
from pathlib import Path

# Allow `python scripts/build_timeout_training.py` from python_ml/ (like uvicorn).
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.timeout_model import SCENARIO_GRID, TimeoutModel

OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "training" / "timeout_training.json"

rng = random.Random(42)

records: list[dict] = []
for consecutive in SCENARIO_GRID["consecutiveScores"]:
    for diff in SCENARIO_GRID["scoreDiff"]:
        for time_left in SCENARIO_GRID["timeRemaining"]:
            for period in SCENARIO_GRID["period"]:
                for timeouts in SCENARIO_GRID["timeoutsAvailable"]:
                    for timeout_called in (1, 0):
                        prob = TimeoutModel.heuristic_stop_prob(
                            with_timeout=bool(timeout_called),
                            consecutive_scores=consecutive,
                            score_diff=diff,
                            time_remaining=time_left,
                            period=period,
                            timeouts_available=timeouts,
                        )
                        records.append(
                            {
                                "consecutiveScores": consecutive,
                                "scoreDiff": diff,
                                "timeRemaining": time_left,
                                "period": period,
                                "timeoutsAvailable": timeouts,
                                "timeoutCalled": timeout_called,
                                "stop": 1 if rng.random() < prob else 0,
                            }
                        )

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"records": records}, indent=1), encoding="utf-8")

stops = sum(r["stop"] for r in records)
print(f"timeout training rows: {len(records)} (stops: {stops}, non-stops: {len(records) - stops})")
print(f"wrote {OUT}")
