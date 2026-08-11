# Timeout Optimizer (Step 8).
#
# Recommends whether the defense should call a timeout by comparing the
# probability of a stop on the opponent's next possession WITH a timeout vs
# WITHOUT one. The counterfactual is the spec's key idea: the same situation
# is evaluated twice — once as if a timeout was called, once as if not.
#
#   8.1  Model: DecisionTreeClassifier (scikit-learn) trained on historical
#        timeout situations; features include a `timeoutCalled` flag so the
#        tree itself provides the counterfactual comparison via predict_proba.
#        When no training data is available the model falls back to a
#        deterministic, explainable rule set (same feature semantics).
#   8.2  Pre-computation: the full scenario grid
#        (5 consecutive × 6 scoreDiff × 5 timeRemaining × 5 period × 3
#        timeoutsAvailable = 2250 rows per sport) is computed once and handed
#        to Node, which writes it to the TimeoutRecommendations table.

import hashlib
import json
import os
import time
from datetime import datetime, timezone

import joblib
import numpy as np
from sklearn.tree import DecisionTreeClassifier

from app.data.model_cache import model_cache
from app.utils.logger import get_logger

logger = get_logger(__name__)

CACHE_KEY = "timeout_tree"

BASE_STOP_PROB = 0.52  # league-average defensive stop rate on one possession
MOMENTUM_PENALTY_PER_SCORE = 0.03  # opponent streak → stops get harder
STREAK_STOP_BONUS = 0.03  # calling time to stop a 3+ score run
STREAK_EXTRA_PER_SCORE = 0.005  # extra bonus per score beyond the first 3
LATE_GAME_BONUS = 0.02  # extra benefit inside the final two minutes
MID_RUN_RESET = 0.02  # reset bonus for a 1-2 score run late in the game
MID_RUN_PER_SCORE = 0.005  # per-score scale for that reset bonus

# Scenario grid — the 2250 combinations per sport (Step 8.2).
SCENARIO_GRID = {
    "consecutiveScores": [0, 1, 2, 3, 4],  # 4 represents 5+
    "scoreDiff": [-12, -6, -2, 0, 3, 8],  # 6 buckets (defense's perspective)
    "timeRemaining": [30, 120, 240, 480, 720],  # 5 buckets (seconds)
    "period": [1, 2, 3, 4, 5],  # 5 levels (5 = OT)
    "timeoutsAvailable": [1, 2, 3],  # 3 levels
}

TREE_FEATURES = [
    "consecutiveScores",
    "scoreDiff",
    "timeRemaining",
    "period",
    "timeoutsAvailable",
    "timeoutCalled",
]

RECOMMENDATION_CALL = (
    "Call a timeout — stopping the opponent's run raises your stop probability "
    "by {pct} percentage points."
)
RECOMMENDATION_WAIT = (
    "Let the play run — the timeout benefit is only {pct} percentage points, "
    "not worth burning a timeout."
)


def _clamp(value: float, low: float = 0.15, high: float = 0.85) -> float:
    return max(low, min(high, value))


def scenario_key(sport: str, consecutive: int, diff: int, time_left: float, period: int, timeouts: int) -> str:
    """Stable hash of the scenario dimensions (uniqueness per sport)."""
    canonical = f"{sport.lower()}|{consecutive}|{diff}|{time_left:.0f}|{period}|{timeouts}"
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]


class TimeoutModel:
    """Timeout recommendation engine."""

    def __init__(self) -> None:
        self._tree: DecisionTreeClassifier | None = None
        self._loaded = False

    # -- stop-probability estimates -------------------------------------------

    @staticmethod
    def heuristic_stop_prob(
        with_timeout: bool,
        consecutive_scores: int,
        score_diff: int,
        time_remaining: float,
        period: int,
        timeouts_available: int,
    ) -> float:
        """Deterministic rule-based stop probability.

        Lower for hot opponents (momentum penalty), higher late in the game
        (urgency) and in later periods. Calling a timeout adds a benefit that
        grows with the opponent's streak (it stops the run) and in the final
        two minutes.
        """
        momentum_penalty = min(max(consecutive_scores, 0), 4) * MOMENTUM_PENALTY_PER_SCORE
        if time_remaining <= 120:
            urgency = 0.05
        elif time_remaining <= 300:
            urgency = 0.02
        else:
            urgency = 0.0
        period_bonus = max(period - 1, 0) * 0.01

        prob = BASE_STOP_PROB - momentum_penalty + urgency + period_bonus
        if with_timeout:
            # A timeout is worth something only when it can stop an actual run
            # (3+ consecutive scores) or reset a short run inside the last
            # five minutes. In a calm, early situation the benefit is zero —
            # burning a timeout there has no upside.
            if consecutive_scores >= 3:
                benefit = STREAK_STOP_BONUS + (consecutive_scores - 3) * STREAK_EXTRA_PER_SCORE
                if time_remaining <= 120:
                    benefit += LATE_GAME_BONUS
            elif consecutive_scores >= 1 and time_remaining <= 300:
                benefit = MID_RUN_RESET + consecutive_scores * MID_RUN_PER_SCORE
            else:
                benefit = 0.0
            prob += benefit
        return round(_clamp(prob), 4)

    def _tree_stop_probs(
        self,
        consecutive_scores: int,
        score_diff: int,
        time_remaining: float,
        period: int,
        timeouts_available: int,
    ) -> tuple[float, float]:
        """predict_proba with timeoutCalled=1 vs 0 when a tree is available."""
        base = [consecutive_scores, score_diff, time_remaining, period, timeouts_available]
        X = np.array([base + [1], base + [0]], dtype=float)
        proba = self._tree.predict_proba(X)[:, 1]
        return round(float(proba[0]), 4), round(float(proba[1]), 4)

    # -- model loading (load → train → heuristic fallback) --------------------

    def _ensure_model(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        cached = model_cache.get(CACHE_KEY)
        if cached is not None:
            self._tree = cached
            logger.info("timeout: tree loaded from model cache")
            return

        model_path = os.getenv("TIMEOUT_MODEL_PATH")
        if model_path and os.path.exists(model_path):
            self._tree = joblib.load(model_path)
            model_cache.set(CACHE_KEY, self._tree)
            logger.info("timeout: tree loaded from %s", model_path)
            return

        data_path = os.getenv("TIMEOUT_TRAINING_DATA")
        if data_path and os.path.exists(data_path):
            rows = self._load_training_data(data_path)
            if self._train_tree(rows):
                logger.info("timeout: tree trained from %s (%d rows)", data_path, len(rows))
                return

        logger.info("timeout: no model/training data — using heuristic rules")

    @staticmethod
    def _load_training_data(path: str) -> list[dict]:
        with open(path, encoding="utf-8") as fh:
            payload = json.load(fh)
        return payload if isinstance(payload, list) else payload.get("records", [])

    def _train_tree(self, rows: list[dict]) -> bool:
        if len(rows) < 50:
            logger.warning("timeout: too few training rows (%d)", len(rows))
            return False
        X = np.array(
            [[r[f] for f in TREE_FEATURES] for r in rows],
            dtype=float,
        )
        y = np.array([int(r["stop"]) for r in rows], dtype=int)
        if len(set(y)) < 2:
            logger.warning("timeout: training target has no variation")
            return False
        tree = DecisionTreeClassifier(max_depth=5, min_samples_leaf=20, random_state=42)
        tree.fit(X, y)
        self._tree = tree
        model_cache.set(CACHE_KEY, tree)
        return True

    # -- public API -----------------------------------------------------------

    def recommend(
        self,
        sport: str,
        consecutive_scores: int,
        score_diff: int,
        time_remaining: float,
        period: int,
        timeouts_available: int = 2,
    ) -> dict:
        """Single-situation recommendation."""
        self._ensure_model()
        if self._tree is not None:
            with_prob, without_prob = self._tree_stop_probs(
                consecutive_scores, score_diff, time_remaining, period, timeouts_available
            )
        else:
            with_prob = self.heuristic_stop_prob(
                True, consecutive_scores, score_diff, time_remaining, period, timeouts_available
            )
            without_prob = self.heuristic_stop_prob(
                False, consecutive_scores, score_diff, time_remaining, period, timeouts_available
            )

        diff = round(with_prob - without_prob, 4)
        should_call = diff > 0.02  # below ~2 points the call isn't worth a timeout
        if diff >= 0.05:
            confidence = "high"
        elif diff >= 0.02:
            confidence = "medium"
        else:
            confidence = "low"

        if should_call:
            text = RECOMMENDATION_CALL.format(pct=round(diff * 100, 1))
        else:
            text = RECOMMENDATION_WAIT.format(pct=round(diff * 100, 1))

        return {
            "shouldCallTimeout": should_call,
            "stopProbabilityWith": with_prob,
            "stopProbabilityWithout": without_prob,
            "probabilityDiff": diff,
            "confidenceLevel": confidence,
            "recommendationText": text,
        }

    def precompute(self, sport: str) -> list[dict]:
        """All 2250 scenarios for a sport (Step 8.2)."""
        self._ensure_model()
        now = datetime.now(timezone.utc).isoformat()
        scenarios = []
        for consecutive in SCENARIO_GRID["consecutiveScores"]:
            for diff in SCENARIO_GRID["scoreDiff"]:
                for time_left in SCENARIO_GRID["timeRemaining"]:
                    for period in SCENARIO_GRID["period"]:
                        for timeouts in SCENARIO_GRID["timeoutsAvailable"]:
                            rec = self.recommend(
                                sport=sport,
                                consecutive_scores=consecutive,
                                score_diff=diff,
                                time_remaining=time_left,
                                period=period,
                                timeouts_available=timeouts,
                            )
                            scenarios.append(
                                {
                                    "scenarioKey": scenario_key(
                                        sport, consecutive, diff, time_left, period, timeouts
                                    ),
                                    "consecutiveScores": consecutive,
                                    "scoreDiff": diff,
                                    "timeRemaining": time_left,
                                    "period": period,
                                    "timeoutsAvailable": timeouts,
                                    "shouldCallTimeout": rec["shouldCallTimeout"],
                                    "stopProbabilityWith": rec["stopProbabilityWith"],
                                    "stopProbabilityWithout": rec["stopProbabilityWithout"],
                                    "probabilityDiff": rec["probabilityDiff"],
                                    "recommendationText": rec["recommendationText"],
                                    "confidenceLevel": rec["confidenceLevel"],
                                    "computedAt": now,
                                }
                            )
        return scenarios


# Module-level singleton — the load chain (cache → joblib → train → heuristic)
# should run once, not once per request. Instances for isolated use (e.g. tests
# that force a fresh training run) can still be constructed directly.
timeout_model = TimeoutModel()


def warmup() -> None:
    """Loads the timeout decision tree (or prepares the heuristic) at startup."""
    timeout_model._ensure_model()  # noqa: SLF001 — internal warmup hook
    logger.info("timeout model warmup complete")
