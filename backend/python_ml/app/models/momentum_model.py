# Momentum Cox Model (Step 7).
#
# Standard survival analysis asks "how long until death"; here it asks
# "how long until the OPPONENT scores next". After a team scores N
# consecutive points, does the opponent's hazard of scoring next change
# significantly?
#
#   7.1-7.3  Season analysis: build survival records from play-by-play
#            (duration = seconds between scores, event = did the opponent
#            score next, covariates = consecutive scores / score diff /
#            period / time), fit CoxPHFitter (lifelines), read the hazard
#            coefficient + p-value + 95% CI for `consecutive`.
#   7.4      Game timeline: rolling home/away consecutive streaks, momentum
#            score = streak × hazard weight, plus peaks / shifts / streaks.

import math
from collections import defaultdict

import pandas as pd
from lifelines import CoxPHFitter

from app.data.model_cache import model_cache
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Minimum survival records needed before the Cox fit is trusted. With less
# data the model either can't converge or the estimate is noise.
MIN_RECORDS = 20

ALPHA = 0.05  # significance threshold (p < 0.05)

# Model-cache key prefix for fitted season models (per sport).
CACHE_KEY_PREFIX = "momentum_cox"


def _round3(value: float | None) -> float | None:
    return None if value is None else round(value, 3)


class MomentumModel:
    """Fits Cox hazard on scoring sequences and builds momentum timelines."""

    # -- survival records (Step 7.2) -----------------------------------------

    @staticmethod
    def _scoring_events(plays: list[dict]) -> list[dict]:
        """Extracts ordered scoring events per game.

        Each event carries: gameId, time (eventTimeSeconds), scorer
        ('home' | 'away' | teamId fallback), scoreDiff, period, and a
        description. Scorer is derived from the home/away score deltas when
        available, otherwise falls back to teamId equality for streak logic.
        """
        by_game: dict[str, list[dict]] = defaultdict(list)
        for play in plays:
            by_game[play["gameId"]].append(play)

        events: list[dict] = []
        for game_id, game_plays in by_game.items():
            ordered = sorted(game_plays, key=lambda p: (p.get("eventTimeSeconds") or 0))
            prev_home = 0
            prev_away = 0
            team_side: dict[str, str] = {}  # teamId → 'home' | 'away' once known
            for play in ordered:
                if not play.get("isScoring"):
                    prev_home = play.get("homeScore", prev_home)
                    prev_away = play.get("awayScore", prev_away)
                    continue
                home = play.get("homeScore")
                away = play.get("awayScore")
                scorer: str | None = None
                if home is not None and away is not None:
                    if away > prev_away and home <= prev_home:
                        scorer = "away"
                    elif home > prev_home and away <= prev_away:
                        scorer = "home"
                    elif away > prev_away and home > prev_home:
                        scorer = "both"  # simultaneous scores — rare, count once below
                    prev_home, prev_away = home, away
                team_id = play.get("teamId")
                if scorer == "both":
                    # Both sides scored on one event — treat as two consecutive
                    # one-score events so streak tracking stays simple.
                    events.append(
                        {
                            "gameId": game_id,
                            "time": play.get("eventTimeSeconds") or 0,
                            "scorer": "away",
                            "scoreDiff": (play.get("homeScore") or 0) - (play.get("awayScore") or 0),
                            "period": play.get("period") or 1,
                            "description": play.get("description"),
                        }
                    )
                    events.append(
                        {
                            "gameId": game_id,
                            "time": (play.get("eventTimeSeconds") or 0) + 0.001,
                            "scorer": "home",
                            "scoreDiff": (play.get("homeScore") or 0) - (play.get("awayScore") or 0),
                            "period": play.get("period") or 1,
                            "description": play.get("description"),
                        }
                    )
                    continue
                if scorer is None and team_id:
                    # Scores missing: remember the side by teamId so streaks
                    # by the same team are consistent.
                    if team_id not in team_side:
                        # Unknown home/away mapping — use teamId as identity.
                        scorer = f"t:{team_id}"
                    else:
                        scorer = team_side[team_id]
                if scorer is None:
                    continue  # no score info at all — can't classify
                if scorer in ("home", "away") and team_id:
                    team_side[team_id] = scorer
                events.append(
                    {
                        "gameId": game_id,
                        "time": play.get("eventTimeSeconds") or 0,
                        "scorer": scorer,
                        "scoreDiff": (play.get("homeScore") or 0) - (play.get("awayScore") or 0),
                        "period": play.get("period") or 1,
                        "description": play.get("description"),
                    }
                )
        return events

    @staticmethod
    def _build_survival_records(events: list[dict]) -> list[dict]:
        """One survival record per scoring event (except the last of a game).

        duration   — seconds between this score and the next score
        event      — 1 if the OPPONENT scored next, 0 if the same team did
        consecutive— how many consecutive scores the scoring team had
                     (including this one) BEFORE this event happened
        score_diff — score differential at the moment of the score
        period     — game period
        time       — seconds elapsed (proxy for time remaining)
        """
        by_game: dict[str, list[dict]] = defaultdict(list)
        for ev in events:
            by_game[ev["gameId"]].append(ev)

        records: list[dict] = []
        for game_events in by_game.values():
            game_events.sort(key=lambda e: e["time"])
            streak = 0
            last_scorer: str | None = None
            for i, ev in enumerate(game_events):
                scorer = ev["scorer"]
                if scorer == last_scorer:
                    streak += 1
                else:
                    streak = 1
                last_scorer = scorer

                nxt = game_events[i + 1] if i + 1 < len(game_events) else None
                if nxt is None:
                    break  # last score of the game — no duration, no record

                duration = max(nxt["time"] - ev["time"], 1.0)  # must be > 0
                opponent_scored = nxt["scorer"] != scorer
                records.append(
                    {
                        "duration": duration,
                        "event": 1 if opponent_scored else 0,
                        "consecutive": streak,
                        "score_diff": float(ev.get("scoreDiff") or 0),
                        "period": ev.get("period") or 1,
                        "time": ev.get("time") or 0,
                    }
                )
        return records

    # -- season analysis (Steps 7.1-7.3) -------------------------------------

    def compute_season(self, sport: str, season: str, plays: list[dict]) -> dict:
        events = self._scoring_events(plays)
        records = self._build_survival_records(events)

        games = {ev["gameId"] for ev in events}
        base = {
            "sport": sport,
            "season": season,
            "gamesAnalyzed": len(games),
            "playsAnalyzed": len(plays),
        }

        insufficient = {
            **base,
            "hazardCoefficient": None,
            "pValue": None,
            "confidenceIntervalLow": None,
            "confidenceIntervalHigh": None,
            "isSignificant": False,
            "effectSize": None,
            "hazardRateChange": None,
            "verdictLabel": "insufficient_data",
            "plainExplanation": (
                f"Not enough scoring data to fit a reliable Cox model for {sport} "
                f"({len(records)} survival records across {len(games)} games; "
                f"need at least {MIN_RECORDS})."
            ),
            "shortExplanation": "Insufficient data to test momentum statistically.",
        }

        if len(records) < MIN_RECORDS:
            logger.warning("momentum: insufficient records (%d < %d)", len(records), MIN_RECORDS)
            return insufficient
        if not any(r["event"] == 1 for r in records) or not any(r["event"] == 0 for r in records):
            logger.warning("momentum: no variation in the event column")
            return insufficient

        try:
            df = pd.DataFrame(records)
            cph = CoxPHFitter()
            cph.fit(
                df,
                duration_col="duration",
                event_col="event",
                show_progress=False,
            )
            summary = cph.summary.loc["consecutive"]
        except Exception as exc:  # noqa: BLE001 — any fit failure → insufficient
            logger.warning("momentum: Cox fit failed (%s)", exc)
            return {
                **insufficient,
                "plainExplanation": (
                    f"The Cox model could not be fitted for {sport} ({exc}). "
                    f"Check that scoring data has enough variation."
                ),
            }

        hazard_coefficient = float(summary["coef"])
        hazard_ratio = float(summary["exp(coef)"])
        p_value = float(summary["p"])
        ci_low = float(summary["exp(coef) lower 95%"])
        ci_high = float(summary["exp(coef) upper 95%"])
        is_significant = p_value < ALPHA
        hazard_rate_change = (hazard_ratio - 1.0) * 100.0

        # Cache the fitted model so game timelines can use its hazard weight.
        # Key is lower-cased to match the router's lookup convention.
        model_cache.set(
            f"{CACHE_KEY_PREFIX}:{sport.lower()}", {"hazard_ratio": hazard_ratio, "cph": cph}
        )

        if is_significant:
            verdict = "significant"
            short = (
                f"Consecutive scoring raises the opponent's scoring hazard by "
                f"{hazard_rate_change:.1f}% per score in {sport} — momentum is real."
            )
            plain = (
                f"After fitting a Cox proportional hazard model on {len(records)} scoring "
                f"sequences across {len(games)} games, each consecutive score raises the "
                f"opponent's hazard of scoring next by {hazard_rate_change:.1f}% "
                f"(hazard ratio {hazard_ratio:.2f}, 95% CI [{ci_low:.2f}, {ci_high:.2f}], "
                f"p = {p_value:.4f}). This effect is statistically significant — momentum "
                f"has a measurable effect in {sport} {season}."
            )
        else:
            verdict = "not_significant"
            short = (
                f"Consecutive scoring has no statistically significant effect on the "
                f"opponent in {sport} (p = {p_value:.4f}) — momentum looks like a myth here."
            )
            plain = (
                f"The Cox model found no significant relationship between consecutive scoring "
                f"and the opponent's hazard of scoring next (hazard ratio {hazard_ratio:.2f}, "
                f"95% CI [{ci_low:.2f}, {ci_high:.2f}], p = {p_value:.4f}). Any apparent "
                f"momentum effect is within the range of random chance for {sport} {season}."
            )

        return {
            **base,
            "hazardCoefficient": _round3(hazard_coefficient),
            # Keep more precision on tiny p-values so e.g. p=0.0002 doesn't
            # display as 0.0 next to isSignificant: true.
            "pValue": round(p_value, 6),
            "confidenceIntervalLow": _round3(ci_low),
            "confidenceIntervalHigh": _round3(ci_high),
            "isSignificant": is_significant,
            "effectSize": _round3(hazard_ratio),
            "hazardRateChange": round(hazard_rate_change, 2),
            "verdictLabel": verdict,
            "plainExplanation": plain,
            "shortExplanation": short,
        }

    # -- game timeline (Step 7.4) ---------------------------------------------

    def compute_game_timeline(self, game_id: str, plays: list[dict], hazard_weight: float | None = None) -> dict:
        """Per-game momentum: rolling consecutive-score streaks, weighted by
        the sport's fitted hazard ratio (resolved by the caller) or a neutral
        1.0 when no season model exists.

        Note: scoring events that cannot be attributed to a side (no home/away
        score deltas and no known teamId mapping) are omitted from the
        timeline, so timelineEvents may be shorter than the play count."""
        weight = hazard_weight if hazard_weight is not None else 1.0

        events = [e for e in self._scoring_events(plays) if e["gameId"] == game_id]
        events.sort(key=lambda e: e["time"])

        home_streak = 0
        away_streak = 0
        home_momentum: list[float] = []
        away_momentum: list[float] = []
        timeline: list[dict] = []
        longest_streak = 0

        for ev in events:
            scorer = ev["scorer"]
            if scorer == "home":
                home_streak += 1
                away_streak = 0
            elif scorer == "away":
                away_streak += 1
                home_streak = 0
            else:  # teamId fallback — attribute to whichever side is unknown
                # Unknown side: keep both streaks but don't reset the other.
                continue

            longest_streak = max(longest_streak, home_streak, away_streak)
            hm = round(home_streak * weight, 3)
            am = round(away_streak * weight, 3)
            home_momentum.append(hm)
            away_momentum.append(am)
            streak_count = home_streak if scorer == "home" else away_streak
            desc = ev.get("description") or (
                f"{'Home' if scorer == 'home' else 'Away'} scores "
                f"({streak_count} consecutive)"
            )
            timeline.append(
                {
                    "gameTimeSeconds": ev["time"],
                    "homeMomentumScore": hm,
                    "awayMomentumScore": am,
                    "eventDescription": desc,
                }
            )

        shifts = self._count_shifts(home_momentum, away_momentum)
        return {
            "gameId": game_id,
            "homeTeamMomentum": home_momentum,
            "awayTeamMomentum": away_momentum,
            "timelineEvents": timeline,
            "peakHomeMomentum": max(home_momentum, default=0.0),
            "peakAwayMomentum": max(away_momentum, default=0.0),
            "momentumShifts": shifts,
            "longestStreak": longest_streak,
        }

    @staticmethod
    def _count_shifts(home: list[float], away: list[float]) -> int:
        """Counts how many times the momentum lead changed hands."""
        shifts = 0
        last_lead: int | None = None  # 1 home, -1 away, 0 tie
        for h, a in zip(home, away):
            lead = 1 if h > a else -1 if a > h else 0
            if last_lead is not None and lead != 0 and last_lead != 0 and lead != last_lead:
                shifts += 1
            if lead != 0:
                last_lead = lead
        return shifts


def _load_local_plays() -> list[dict]:
    """Loads play-by-play for the startup Cox fit from the local NFL dataset
    (app/data/nfl_local/plays.json — exported from the backend DB) and maps
    the nflfastR shape to the momentum plays shape (gameId, eventTimeSeconds,
    teamId, isScoring, homeScore, awayScore, period, description)."""
    import json
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "app" / "data" / "nfl_local" / "plays.json"
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(raw, list):
        return []

    by_game: dict[str, list[dict]] = defaultdict(list)
    for play in raw:
        by_game[str(play.get("game_id"))].append(play)

    mapped: list[dict] = []
    for game_plays in by_game.values():
        game_plays.sort(key=lambda p: (p.get("game_seconds_remaining") is None, -(p.get("game_seconds_remaining") or 0)))
        prev_home = 0
        prev_away = 0
        for play in game_plays:
            home = play.get("home_score")
            away = play.get("away_score")
            if home is None or away is None:
                continue
            is_scoring = home != prev_home or away != prev_away
            seconds_left = play.get("game_seconds_remaining")
            mapped.append(
                {
                    "gameId": str(play.get("game_id")),
                    "eventTimeSeconds": float(3600 - seconds_left) if seconds_left is not None else 0.0,
                    "teamId": str(play.get("posteam")) if play.get("posteam") is not None else None,
                    "isScoring": is_scoring,
                    "homeScore": home,
                    "awayScore": away,
                    "period": play.get("qtr") or 1,
                    "description": play.get("desc"),
                }
            )
            prev_home, prev_away = home, away
    return mapped


def warmup() -> None:
    """Imports lifelines and fits the Cox model from local NFL play-by-play so
    /health reports the momentum model as loaded and game timelines get a real
    hazard weight. Degrades gracefully when data is insufficient."""
    try:
        plays = _load_local_plays()
        if not plays:
            logger.info("momentum warmup: no local plays — model stays unloaded")
            return
        result = MomentumModel().compute_season("nfl", "2025", plays)
        if result.get("hazardCoefficient") is not None:
            logger.info(
                "momentum warmup: Cox fitted for nfl (hazard ratio %.3f, p=%.3f, %d games)",
                result.get("hazardRateChange") is not None
                and (1 + result.get("hazardRateChange", 0) / 100) or 0,
                result.get("pValue") or 0,
                result.get("gamesAnalyzed") or 0,
            )
        else:
            logger.info(
                "momentum warmup: Cox not fitted (%s) — model stays unloaded",
                result.get("verdictLabel"),
            )
    except Exception as exc:  # noqa: BLE001 — warmup must never block startup
        logger.warning("momentum warmup failed (%s)", exc)
