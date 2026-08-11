# Decision EV Model (Step 6).
# Two pieces:
#   6.1 Win Probability — LogisticRegression (scikit-learn) trained on historical
#       play-by-play features → P(team wins from this situation). Model file is
#       loaded on startup (fast); if none exists it is trained from available
#       data; until real data exists a calibrated heuristic covers every call.
#   6.2 EV — for each available action, estimate probSuccess (lookup tables),
#       run the WP model on the success/failure outcome states, and
#       EV = p × WP(success) + (1-p) × WP(failure). Best option = highest EV.
#
# All states are expressed from the DECISION TEAM's perspective:
# positive scoreDiff = decision team ahead; fieldPosition = yards to the
# opponent's goal line (0-100, higher = closer to scoring).

import math
import os
from pathlib import Path
from typing import Any

from app.data.model_cache import model_cache
from app.utils.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Historical lookup tables (Step 6.2) — computed from historical data, stored
# as Python dicts for fast lookup.
# ---------------------------------------------------------------------------

# 4th-down conversion rate bucketed by (yards-to-go bucket, field-position zone).
# field zone key: "own" = fp <= 50 (own half), "opp" = fp > 50 (opponent half).
FOURTH_DOWN_RATES: dict[tuple[str, str], float] = {
    ("1", "own"): 0.68,  # spec: 4th and 1 from own 30 → 68%
    ("1", "opp"): 0.75,
    ("2", "own"): 0.56,
    ("2", "opp"): 0.62,
    ("3_4", "own"): 0.50,
    ("3_4", "opp"): 0.55,
    ("5_6", "own"): 0.38,
    ("5_6", "opp"): 0.41,  # spec: 4th and 5 from opp 20 → 41%
    ("7plus", "own"): 0.32,
    ("7plus", "opp"): 0.36,
}

# Field goal success rate bucketed by kick distance (yards).
FG_RATES: list[tuple[int, float]] = [
    (0, 0.95),
    (30, 0.90),
    (35, 0.85),
    (40, 0.78),  # spec: 40-44 yards → 78%
    (45, 0.70),
    (50, 0.63),  # spec: 50-54 yards → 63%
    (55, 0.55),
    (60, 0.45),
]

PUNT_NET_YARDS = 44  # expected net punt distance
GO_GAIN_YARDS = 4  # expected gain when a 4th-down conversion succeeds
FG_HOLDER_AND_ENDZONE = 17  # FG distance = 100 - fp + 17 (holder + end zone)

TWO_PT_SUCCESS = 0.49  # league-average 2-point conversion rate
XP_SUCCESS = 0.94  # league-average extra point rate

# NBA (Step 6.3)
SHOT_TABLE: dict[str, tuple[float, float]] = {
    "at_rim": (2.0, 0.62),  # shot value, shooter conversion
    "mid_range": (2.0, 0.42),
    "three_point": (3.0, 0.36),
}
FT_SUCCESS = 0.78  # free-throw percentage for the fouling-up-3 scenario
THREE_PT_ATTEMPT = 0.36  # probability opponent makes a 3 to tie


# ---------------------------------------------------------------------------
# Win Probability Model
# ---------------------------------------------------------------------------

# Feature order for the logistic regression (all from the decision team's
# perspective; target = did THAT team win). Keep in sync with
# `_engineer_features` below.

DEFAULT_MODEL_PATH = str(Path(__file__).resolve().parents[2] / "models" / "wp_model.joblib")


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def heuristic_win_prob(
    score_diff: float,
    time_remaining: float,
    has_ball: bool = True,
    field_position: float | None = None,
    is_home: bool = True,
) -> float:
    """Deterministic, calibrated WP fallback (used until a trained model exists).

    z = scoreDiff × perPoint + possession edge + field-position edge + home edge.
    perPoint grows from ~0.03 (early) to ~0.18 (end of game), so a lead is
    worth more the less time remains — the shape every WP model has.
    """
    total_seconds = 3600.0  # NFL regulation; close enough for all sports at MVP level
    time_factor = _clamp(time_remaining / total_seconds, 0.0, 1.0)
    per_point = 0.03 + 0.15 * (1.0 - time_factor)
    # fieldPosition = yards to the opponent's goal line: LOWER = closer to
    # scoring = better, so closer to midfield scores 0 and the red zone is +.
    field_bonus = ((50.0 - field_position) / 50.0) * 0.04 if field_position is not None else 0.0
    z = (
        score_diff * per_point
        + (0.05 if has_ball else -0.05)
        + field_bonus
        + (0.02 if is_home else -0.02)
    )
    return 1.0 / (1.0 + math.exp(-z))


def _engineer_features(state: dict) -> list[float]:
    """Maps a game-state dict to the model's feature vector."""
    return [
        float(state.get("score_diff", 0)),
        float(state.get("time_remaining", 0)),
        1.0 if state.get("is_home") else 0.0,
        1.0 if state.get("has_ball") else 0.0,
        float(state.get("down") or 0),
        float(state.get("field_position") or 50.0),
        float(state.get("timeouts") or 0),
        float(state.get("period") or 1),
    ]


class WinProbabilityModel:
    """Logistic regression WP model with load-from-disk / train / heuristic chain.

    Resolution order (fastest first):
      1. in-memory model cache (already loaded this process)
      2. joblib file at WP_MODEL_PATH
      3. train from WP_TRAINING_DATA if configured
      4. heuristic fallback (always works)
    """

    def __init__(self, model_path: str | None = None) -> None:
        self.model_path = model_path or os.getenv("WP_MODEL_PATH") or DEFAULT_MODEL_PATH
        self._model: Any | None = None

    # -- loading -----------------------------------------------------------

    def ensure_loaded(self) -> Any | None:
        """Returns the fitted sklearn model, or None → callers use heuristic."""
        cached = model_cache.get("wp_model")
        if cached is not None:
            self._model = cached
            return self._model

        path = Path(self.model_path)
        if path.exists():
            try:
                import joblib

                self._model = joblib.load(path)
                model_cache.set("wp_model", self._model)
                logger.info("WP model loaded from %s", self.model_path)
                return self._model
            except Exception as exc:  # noqa: BLE001 — corrupt file → retrain/fallback
                logger.warning("WP model file unreadable (%s) — will retrain", exc)

        # No file: train from configured data if available, else heuristic.
        data_path = os.getenv("WP_TRAINING_DATA")
        if data_path and Path(data_path).exists():
            try:
                samples = _load_training_data(data_path)
                if len(samples) >= 100:
                    result = self.train(samples)
                    logger.info("WP model trained from %s (accuracy %s)", data_path, result.get("accuracy"))
                    return self._model
            except Exception as exc:  # noqa: BLE001
                logger.warning("WP training failed (%s) — falling back to heuristic", exc)

        logger.info("No WP model available — using heuristic win probability")
        return None

    # -- training ----------------------------------------------------------

    def train(self, samples: list[dict]) -> dict:
        """Fits LogisticRegression on feature-engineered samples.

        Each sample: {**state fields, "outcome": 1 if the decision team won}.
        Splits 80/20, evaluates accuracy on the holdout, saves joblib to
        WP_MODEL_PATH, and caches the fitted model in memory.
        """
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score
        from sklearn.model_selection import train_test_split

        X = [_engineer_features(s) for s in samples]
        y = [1 if s.get("outcome") else 0 for s in samples]
        if len(X) < 10:
            raise ValueError("Need at least 10 samples to train the WP model")

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(X_train, y_train)
        accuracy = float(accuracy_score(y_test, model.predict(X_test)))

        path = Path(self.model_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        import joblib

        joblib.dump(model, path)
        self._model = model
        model_cache.set("wp_model", model)
        logger.info("WP model trained — accuracy %.3f (target > 0.65), saved to %s", accuracy, path)
        return {"accuracy": accuracy, "samples": len(X), "model_path": str(path)}

    # -- prediction --------------------------------------------------------

    def predict(self, state: dict) -> float:
        """P(decision team wins from `state`). Falls back to the heuristic
        whenever no fitted model is available (cold start, missing data)."""
        model = self.ensure_loaded()
        if model is not None:
            try:
                prob = model.predict_proba([_engineer_features(state)])[0]
                return float(prob[1] if len(prob) > 1 else prob[0])
            except Exception as exc:  # noqa: BLE001 — never let prediction crash a decision
                logger.warning("WP model prediction failed (%s) — using heuristic", exc)
        return heuristic_win_prob(
            score_diff=state.get("score_diff", 0),
            time_remaining=state.get("time_remaining", 0),
            has_ball=bool(state.get("has_ball")),
            field_position=state.get("field_position"),
            is_home=bool(state.get("is_home")),
        )


def _load_training_data(path: str) -> list[dict]:
    """Loads training samples from a JSON array or CSV file (path set in
    WP_TRAINING_DATA). Each row needs the feature fields + an outcome."""
    import csv
    import json

    p = Path(path)
    if p.suffix.lower() == ".csv":
        with p.open(newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    with p.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else data.get("samples", [])


# ---------------------------------------------------------------------------
# EV calculation
# ---------------------------------------------------------------------------

def _fg_success(distance: float) -> float:
    """Field-goal success probability from a kick distance (bucketed table)."""
    best = FG_RATES[-1][1]
    for threshold, rate in FG_RATES:
        if distance < threshold:
            break
        best = rate
    return best


def _fourth_down_success(yards_to_go: int, field_position: int) -> float:
    """4th-down conversion probability bucketed by yards-to-go + field zone.

    fieldPosition = yards to the OPPONENT's goal line (0-100), so own 30 → 70
    and opponent 35 → 35. Own half = fp >= 50; opponent half = fp < 50.
    """
    if yards_to_go <= 1:
        bucket = "1"
    elif yards_to_go <= 2:
        bucket = "2"
    elif yards_to_go <= 4:
        bucket = "3_4"
    elif yards_to_go <= 6:
        bucket = "5_6"
    else:
        bucket = "7plus"
    zone = "own" if field_position >= 50 else "opp"
    return FOURTH_DOWN_RATES[(bucket, zone)]


class DecisionEVModel:
    """Computes expected value for coaching decisions."""

    def __init__(self) -> None:
        self.wp = WinProbabilityModel()

    def compute(
        self,
        sport: str,
        decision_type: str,
        chosen_action: str,
        context: dict,
        available_actions: list[str] | None = None,
    ) -> dict:
        ctx = dict(context)
        ctx.setdefault("sport", sport)
        sport_key = (sport or "").lower()
        decision_key = (decision_type or "").lower()
        chosen_key = _canonical_action(chosen_action)

        state = self._base_state(ctx)
        win_prob_before = self.wp.predict(state)

        options = self._options(decision_key)
        actions = [a for a in available_actions if a] if available_actions else [chosen_action]
        if not actions:
            actions = [o["action"] for o in options]

        evaluated = [self._evaluate(decision_key, sport_key, action, ctx) for action in actions]
        # Fall back to the full default option list if none of the provided
        # actions resolved (keeps the response complete instead of empty).
        if not evaluated or all(e["ev"] is None for e in evaluated):
            evaluated = [self._evaluate(decision_key, sport_key, o["action"], ctx) for o in options]
        evaluated = [e for e in evaluated if e["ev"] is not None]

        chosen = next((e for e in evaluated if e["action"] == chosen_key), None)
        if chosen is None:
            # Evaluate the chosen action even when it wasn't in the provided
            # list, and surface it in allOptions + evBest comparison.
            chosen = self._evaluate(decision_key, sport_key, chosen_action, ctx)
            if chosen.get("ev") is not None:
                evaluated.append(chosen)

        best = max(evaluated, key=lambda e: e["ev"]) if evaluated else chosen
        ev_chosen = chosen["ev"]
        ev_best = best["ev"]
        is_optimal = abs(ev_chosen - ev_best) < 1e-6

        return {
            "decisionType": decision_type,
            "evChosen": round(ev_chosen, 4),
            "evBest": round(ev_best, 4),
            "evDifference": round(ev_best - ev_chosen, 4),
            "isOptimal": is_optimal,
            "winProbBefore": round(win_prob_before, 4),
            "winProbabilityBefore": round(win_prob_before, 4),
            "allOptions": [
                {
                    "action": e["action"],
                    "ev": round(e["ev"], 4),
                    "probSuccess": e.get("probSuccess"),
                    "wpIfSuccess": e.get("wpIfSuccess"),
                    "wpIfFailure": e.get("wpIfFailure"),
                }
                for e in evaluated
            ],
            "explanation": self._explain(decision_key, sport_key, ctx, chosen_action, ev_chosen, ev_best),
        }

    def _options(self, decision_key: str) -> list[dict]:
        """Default available options per decision type (when the caller sends
        none, or to fill the response when provided actions don't resolve)."""
        defaults = {
            "4th_down": [
                {"action": "go"},
                {"action": "punt"},
                {"action": "field_goal"},
            ],
            "2pt_conversion": [{"action": "two_point_attempt"}, {"action": "extra_point"}],
            "2pt": [{"action": "two_point_attempt"}, {"action": "extra_point"}],
            "timeout": [{"action": "call_timeout"}, {"action": "let_clock_run"}],
            "shot_selection": [{"action": "at_rim"}, {"action": "mid_range"}, {"action": "three_point"}],
            "foul_strategy": [{"action": "foul"}, {"action": "no_foul"}],
        }
        return defaults.get(decision_key, [{"action": "keep_current"}])

    # -- state helpers ------------------------------------------------------

    @staticmethod
    def _base_state(ctx: dict) -> dict:
        fp = ctx.get("fieldPosition")
        return {
            "score_diff": float(ctx.get("scoreDiff") if ctx.get("scoreDiff") is not None else 0),
            "time_remaining": float(
                ctx.get("timeRemainingSeconds") if ctx.get("timeRemainingSeconds") is not None else 0
            ),
            "is_home": bool(ctx.get("isHome")),
            "has_ball": True,
            "down": ctx.get("down"),
            "field_position": float(fp) if fp is not None else 50.0,
            "timeouts": float(ctx.get("timeoutsRemaining") or 0),
            "period": ctx.get("period") or 1,
        }

    @staticmethod
    def _opponent_state(state: dict, score_diff: float, opp_field_position: float) -> dict:
        """State from the OPPONENT's perspective (decision team WP = 1 - this)."""
        return {
            **state,
            "score_diff": -score_diff,
            "has_ball": True,
            "field_position": opp_field_position,
            "is_home": not state["is_home"],
        }

    def _wp(self, state: dict) -> float:
        return self.wp.predict(state)

    # -- option evaluation --------------------------------------------------

    def _evaluate(self, decision_key: str, sport_key: str, action: str, ctx: dict) -> dict:
        key = _canonical_action(action)
        handler = self._handlers().get(decision_key)
        if handler is None:
            handler = self._generic_evaluate
        try:
            return handler(sport_key, key, ctx)
        except Exception as exc:  # noqa: BLE001 — an un-evaluable option is skipped
            logger.warning("EV evaluation failed for %s/%s: %s", decision_key, action, exc)
            return {"action": key, "ev": None}

    def _handlers(self) -> dict:
        return {
            "4th_down": self._eval_fourth_down,
            "2pt_conversion": self._eval_two_point,
            "2pt": self._eval_two_point,
            "timeout": self._eval_timeout,
            "shot_selection": self._eval_nba_shot,
            "foul_strategy": self._eval_nba_foul,
        }

    def _generic_evaluate(self, sport_key: str, action: str, ctx: dict) -> dict:
        """Fallback: EV = win probability of the current state (no-op action)."""
        state = self._base_state(ctx)
        wp = self._wp(state)
        return {
            "action": action,
            "ev": wp,
            "probSuccess": 1.0,
            "wpIfSuccess": round(wp, 4),
            "wpIfFailure": None,
        }

    def _eval_fourth_down(self, sport_key: str, action: str, ctx: dict) -> dict:
        """NFL 4th down: go / punt / field_goal.

        For each option, success and failure leave the game in a known state;
        EV = p × WP(success) + (1-p) × WP(failure). Opponent-possession
        outcomes are evaluated from the opponent's perspective (1 - wp_opp).
        """
        state = self._base_state(ctx)
        score_diff = state["score_diff"]
        time_left = state["time_remaining"]
        fp = int(state["field_position"])
        ytg = int(ctx.get("yardsToGo") or 0)

        if action == "go":
            p = _fourth_down_success(ytg, fp)
            # Success: new 1st down, ball advanced toward the opponent goal;
            # failure: turnover on downs at the spot.
            success_state = {**state, "field_position": float(max(fp - GO_GAIN_YARDS, 1)), "down": 1}
            failure_state = self._opponent_state(state, score_diff, 100.0 - fp)
            wp_success = self._wp(success_state)
            wp_failure = 1.0 - self._wp(failure_state)
        elif action == "punt":
            p = 1.0  # punt always executes; "success" = field position after net punt
            # Decision team punts from fp; net 44 yards toward the opponent goal,
            # opponent takes over there. From the OPPONENT's perspective the spot
            # is 100 - (fp - 44) yards from the decision team's goal.
            opp_fp = _clamp(100.0 - (fp - PUNT_NET_YARDS), 0.0, 100.0)
            punt_state = self._opponent_state(state, score_diff, opp_fp)
            wp_success = 1.0 - self._wp(punt_state)
            wp_failure = wp_success  # no separate failure branch for a punt
        elif action == "field_goal":
            distance = fp + FG_HOLDER_AND_ENDZONE  # opp 35 → 35 + 17 = 52 yd kick
            p = _fg_success(distance)
            # Make: +3, opponent ball at own 25 (their fp = 75). Miss: opponent ball at spot.
            make_state = self._opponent_state(state, score_diff + 3, 75.0)
            miss_state = self._opponent_state(state, score_diff, 100.0 - fp)
            wp_success = 1.0 - self._wp(make_state)
            wp_failure = 1.0 - self._wp(miss_state)
        else:
            return self._generic_evaluate(sport_key, action, ctx)

        ev = p * wp_success + (1 - p) * wp_failure
        return {
            "action": action,
            "ev": ev,
            "probSuccess": round(p, 4),
            "wpIfSuccess": round(wp_success, 4),
            "wpIfFailure": round(wp_failure, 4),
        }

    def _eval_two_point(self, sport_key: str, action: str, ctx: dict) -> dict:
        """2-point conversion vs extra point (both after a touchdown)."""
        state = self._base_state(ctx)
        score_diff = state["score_diff"]

        if action in ("two_point_attempt", "2pt"):
            p, pts = TWO_PT_SUCCESS, 2
        elif action in ("extra_point", "xp", "pat"):
            p, pts = XP_SUCCESS, 1
        else:
            return self._generic_evaluate(sport_key, action, ctx)

        # Success: the scoring team kicks off → opponent ball at own 25 (fp 75).
        success_state = self._opponent_state(state, score_diff + pts, 75.0)
        # Failure: turnover at the 2-yard line → opponent pinned deep (fp 98).
        failure_state = self._opponent_state(state, score_diff, 98.0)
        wp_success = 1.0 - self._wp(success_state)
        wp_failure = 1.0 - self._wp(failure_state)
        ev = p * wp_success + (1 - p) * wp_failure
        return {
            "action": action,
            "ev": ev,
            "probSuccess": round(p, 4),
            "wpIfSuccess": round(wp_success, 4),
            "wpIfFailure": round(wp_failure, 4),
        }

    def _eval_timeout(self, sport_key: str, action: str, ctx: dict) -> dict:
        """Calling a timeout preserves clock — helps a trailing team, slightly
        hurts a leading team (gives the opponent a breather + planning)."""
        state = self._base_state(ctx)
        score_diff = state["score_diff"]
        wp = self._wp(state)

        if action == "call_timeout":
            benefit = 0.03 if score_diff < 0 else -0.01
            ev = wp + benefit
        else:  # let_clock_run
            benefit = 0.0
            ev = wp
        return {
            "action": action,
            "ev": round(ev, 4),
            "probSuccess": 1.0,
            "wpIfSuccess": round(wp + benefit, 4),
            "wpIfFailure": None,
        }

    def _eval_nba_shot(self, sport_key: str, action: str, ctx: dict) -> dict:
        """Late-game shot selection (Step 6.3): expected points = value × pct.
        EV is expressed in points and compared across shot types; WP fields
        use the shot's point value applied to the score differential."""
        if action not in SHOT_TABLE:
            return self._generic_evaluate(sport_key, action, ctx)
        value, pct = SHOT_TABLE[action]
        state = self._base_state(ctx)
        ev_points = value * pct
        success_state = {**state, "score_diff": state["score_diff"] + value, "has_ball": False}
        wp_success = self._wp(success_state)
        wp_failure = self._wp({**state, "has_ball": False})
        return {
            "action": action,
            "ev": round(ev_points, 4),
            "probSuccess": round(pct, 4),
            "wpIfSuccess": round(wp_success, 4),
            "wpIfFailure": round(wp_failure, 4),
        }

    def _eval_nba_foul(self, sport_key: str, action: str, ctx: dict) -> dict:
        """Fouling when up 3 (Step 6.3). Analytics: DON'T foul is higher EV —
        the opponent only ties ~36% of the time from 3, and fouling lets them
        within 1 on two made FTs (~61%)."""
        state = self._base_state(ctx)
        score_diff = state["score_diff"]  # up 3 → +3

        if action == "foul":
            # Opponent shoots 2 FTs: 0 / 1 / 2 makes. State is already the
            # DECISION TEAM's perspective (decision team gets the ball after
            # the final FT / rebound), so WP drops as the opponent scores.
            p0, p1, p2 = (1 - FT_SUCCESS) ** 2, 2 * FT_SUCCESS * (1 - FT_SUCCESS), FT_SUCCESS**2
            wp0 = self._wp({**state, "score_diff": score_diff, "has_ball": True})
            wp1 = self._wp({**state, "score_diff": score_diff - 1, "has_ball": True})
            wp2 = self._wp({**state, "score_diff": score_diff - 2, "has_ball": True})
            ev = p0 * wp0 + p1 * wp1 + p2 * wp2
            return {
                "action": action,
                "ev": round(ev, 4),
                "probSuccess": round(1 - p0, 4),  # opponent scores at least one FT
                "wpIfSuccess": round(p2 * wp2 + p1 * wp1, 4),
                "wpIfFailure": round(wp0, 4),
            }

        # no_foul — opponent attempts a 3 to tie.
        make_wp = 0.5  # tied → roughly a coin flip (OT)
        miss_state = {**state, "score_diff": score_diff, "has_ball": True}  # defensive rebound
        miss_wp = self._wp(miss_state)  # still up 3 with the ball → WP stays high
        ev = THREE_PT_ATTEMPT * make_wp + (1 - THREE_PT_ATTEMPT) * miss_wp
        return {
            "action": action,
            "ev": round(ev, 4),
            "probSuccess": round(THREE_PT_ATTEMPT, 4),
            "wpIfSuccess": round(make_wp, 4),
            "wpIfFailure": round(miss_wp, 4),
        }

    # -- explanation ---------------------------------------------------------

    def _explain(
        self,
        decision_key: str,
        sport_key: str,
        ctx: dict,
        chosen_action: str,
        ev_chosen: float,
        ev_best: float,
    ) -> str:
        diff = ev_best - ev_chosen
        if decision_key == "4th_down":
            ytg = ctx.get("yardsToGo")
            fp = ctx.get("fieldPosition")
            if ytg is not None and fp is not None:
                if fp >= 50:
                    situation = f"4th and {ytg} from the team's own {100 - int(fp)} yard line"
                else:
                    situation = f"4th and {ytg} from the opponent {int(fp)} yard line"
            else:
                situation = "4th down"
            verdict = "optimal" if diff < 1e-6 else f"left {diff:.3f} EV on the table"
            return (
                f"{situation}: the best option was worth {ev_best:.3f} EV vs the chosen "
                f"'{chosen_action}' at {ev_chosen:.3f} — the decision was {verdict}."
            )
        if decision_key == "2pt_conversion" or decision_key == "2pt":
            verdict = "optimal" if diff < 1e-6 else f"cost {diff:.3f} EV"
            return (
                f"Two-point conversion decision: best option EV {ev_best:.3f} vs chosen "
                f"'{chosen_action}' at {ev_chosen:.3f} — the call {verdict}."
            )
        if decision_key == "foul_strategy":
            return (
                f"Up 3 late: analytics favor letting them shoot (EV {ev_best:.3f}) over "
                f"fouling (EV {ev_chosen:.3f}) — fouling risks two made free throws pulling "
                f"the opponent within one."
            )
        if decision_key == "shot_selection":
            return (
                f"Shot selection: best expected value is {ev_best:.2f} points vs the chosen "
                f"'{chosen_action}' at {ev_chosen:.2f} points."
            )
        return f"Decision '{chosen_action}' EV {ev_chosen:.3f} vs best {ev_best:.3f}."


_ACTION_ALIASES: dict[str, str] = {
    "go": "go",
    "go_for_it": "go",
    "go for it": "go",
    "go4it": "go",
    "punt": "punt",
    "field_goal": "field_goal",
    "field goal": "field_goal",
    "fg": "field_goal",
    "two_point_attempt": "two_point_attempt",
    "two point": "two_point_attempt",
    "2pt": "two_point_attempt",
    "2pt_conversion": "two_point_attempt",
    "2pt conversion": "two_point_attempt",
    "extra_point": "extra_point",
    "extra point": "extra_point",
    "xp": "extra_point",
    "pat": "extra_point",
    "call_timeout": "call_timeout",
    "timeout": "call_timeout",
    "let_clock_run": "let_clock_run",
    "let clock run": "let_clock_run",
    "let it run": "let_clock_run",
    "at_rim": "at_rim",
    "at rim": "at_rim",
    "rim": "at_rim",
    "mid_range": "mid_range",
    "mid range": "mid_range",
    "mid": "mid_range",
    "three_point": "three_point",
    "3pt": "three_point",
    "3-pointer": "three_point",
    "three pointer": "three_point",
    "foul": "foul",
    "foul_up_3": "foul",
    "foul up 3": "foul",
    "no_foul": "no_foul",
    "don't foul": "no_foul",
    "dont foul": "no_foul",
    "let_them_shoot": "no_foul",
}


def _canonical_action(action: str | None) -> str:
    key = (action or "").strip().lower()
    return _ACTION_ALIASES.get(key, key.replace(" ", "_"))


def warmup() -> None:
    """Loads the WP model if it exists (fast) — training happens lazily."""
    DecisionEVModel().wp.ensure_loaded()
    logger.info("decision model warmup complete")
