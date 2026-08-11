# Injury Risk Model (Step 5).
# Z-score based workload risk:
#   - personal baseline = mean/std of each metric over the last `baselineDays` (21)
#   - recent window      = the most recent `windowDays` (7) of games
#   - z-score per metric = (recent window avg - baseline mean) / baseline std
# Flags fire when any metric z-score > 1.5, back-to-back games appear in the
# window, or the player plays more than 4 games in 7 days. The composite
# 0-100 score maps to green / yellow / red zones with plain-English
# explanations. With fewer than 5 baseline games the risk is null (a reliable
# baseline is impossible).

from datetime import UTC, date, datetime, timedelta
from statistics import stdev

from app.utils.logger import get_logger

logger = get_logger(__name__)

# --- Constants (Step 5.3 / 5.4) -------------------------------------------------

ZSCORE_ELEVATED = 1.5  # z > 1.5 → elevated (yellow)
ZSCORE_HIGH = 2.0  # z > 2.0 → high (red)
MIN_BASELINE_GAMES = 5  # need >= 5 games for a reliable baseline
MAX_GAMES_IN_WINDOW = 4  # > 4 games in the 7-day window is a flag

MINUTES_MAX_POINTS = 40  # minutes z-score contribution (up to)
DISTANCE_MAX_POINTS = 25  # distance z-score contribution (up to)
INTENSITY_MAX_POINTS = 20  # intensity z-score contribution (up to)
BACK_TO_BACK_PENALTY = 10  # flat penalty
HIGH_GAME_PENALTY = 5  # per game over 3 in the window

GREEN_MAX = 33  # 0-33 → green
YELLOW_MAX = 66  # 34-66 → yellow; 67-100 → red

def _parse_date(value: str | date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _metric_values(logs: list[dict], key: str) -> list[float]:
    """Non-null values of a metric across logs (minutes/distance/intensity)."""
    return [float(v) for g in logs if (v := g.get(key)) is not None]


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _std(values: list[float]) -> float | None:
    return stdev(values) if len(values) >= 2 else None


def _zscore(value: float | None, baseline_mean: float | None, baseline_std: float | None) -> float | None:
    """(recent avg - baseline mean) / baseline std; 0 when there is no spread
    (Step 12 spec: identical minutes every game must yield z = 0, not None)."""
    if value is None or baseline_mean is None or baseline_std is None:
        return None
    if baseline_std == 0:
        return 0.0
    return (value - baseline_mean) / baseline_std


def metric_points(z: float | None, max_points: int) -> float:
    """Maps a metric z-score to risk-score points (Step 5.4 scale):
    z <= 1.5 → 0;  z in (1.5, 2.0] → 50%-75% of max;  z > 2.0 → 75%-100% of max
    (reaching max at z >= 4.0). Minutes z=2.375 → ~31 of 40."""
    if z is None or z <= ZSCORE_ELEVATED:
        return 0.0
    low = max_points * 0.5  # points at z = 1.5
    mid = max_points * 0.75  # points at z = 2.0
    if z <= ZSCORE_HIGH:
        return low + (z - ZSCORE_ELEVATED) / (ZSCORE_HIGH - ZSCORE_ELEVATED) * (mid - low)
    frac = min((z - ZSCORE_HIGH) / ZSCORE_HIGH, 1.0)  # full points at z = 4.0
    return mid + frac * (max_points - mid)


def _zone_for_score(score: float) -> str:
    if score <= GREEN_MAX:
        return "green"
    if score <= YELLOW_MAX:
        return "yellow"
    return "red"


def _zone_prefix(zone: str) -> str:
    return {
        "red": "HIGH RISK: ",
        "yellow": "ELEVATED RISK: ",
        "green": "Normal workload: ",
    }[zone]


class InjuryRiskModel:
    """Computes a player's injury risk from workload game logs."""

    def compute(
        self,
        player_id: str,
        game_logs: list[dict],
        player_name: str | None = None,
        sport: str | None = None,
        window_days: int = 7,
        baseline_days: int = 21,
    ) -> dict:
        logs = sorted(game_logs, key=lambda g: _parse_date(g["date"]))
        if not logs:
            return self._insufficient(player_id, player_name, baseline_days, data_points=0)

        ref = _parse_date(logs[-1]["date"])  # most recent game anchors the windows
        # NON-OVERLAPPING windows (matches the spec example: baseline mean 28.5 /
        # std 3.2 vs a 36.1 recent average gives exactly z = 2.375). The baseline
        # is the `baselineDays` before the recent `windowDays` — so a spike in the
        # window isn't diluted by being included in its own baseline.
        recent_start = ref - timedelta(days=window_days)
        baseline_start = ref - timedelta(days=window_days + baseline_days)

        recent = [g for g in logs if _parse_date(g["date"]) > recent_start]
        baseline = [g for g in logs if baseline_start < _parse_date(g["date"]) <= recent_start]

        if len(baseline) < MIN_BASELINE_GAMES:
            return self._insufficient(player_id, player_name, baseline_days, data_points=len(baseline))

        # --- 5.2 baseline per metric -------------------------------------------
        # Extract each metric list once, then reuse for mean + std.
        baseline_minutes = _metric_values(baseline, "minutesPlayed")
        baseline_distance = _metric_values(baseline, "distanceCovered")
        baseline_intensity = _metric_values(baseline, "highIntensityEvents")
        minutes_mean, minutes_std = _mean(baseline_minutes), _std(baseline_minutes)
        distance_mean, distance_std = _mean(baseline_distance), _std(baseline_distance)
        intensity_mean, intensity_std = _mean(baseline_intensity), _std(baseline_intensity)

        # --- 5.3 z-scores on the recent window ---------------------------------
        minutes_z = _zscore(_mean(_metric_values(recent, "minutesPlayed")), minutes_mean, minutes_std)
        distance_z = _zscore(_mean(_metric_values(recent, "distanceCovered")), distance_mean, distance_std)
        intensity_z = _zscore(
            _mean(_metric_values(recent, "highIntensityEvents")), intensity_mean, intensity_std
        )

        back_to_back_flag = any(bool(g.get("backToBack")) for g in recent)
        games_in_window = len(recent)
        high_games_flag = games_in_window > MAX_GAMES_IN_WINDOW

        # --- 5.4 composite risk score 0-100 ------------------------------------
        score = 0.0
        score += metric_points(minutes_z, MINUTES_MAX_POINTS)
        score += metric_points(distance_z, DISTANCE_MAX_POINTS)
        score += metric_points(intensity_z, INTENSITY_MAX_POINTS)
        if back_to_back_flag:
            score += BACK_TO_BACK_PENALTY
        if games_in_window > 3:
            score += (games_in_window - 3) * HIGH_GAME_PENALTY
        risk_score = round(min(score, 100.0), 1)

        zone = _zone_for_score(risk_score)
        trigger = self._pick_trigger(
            minutes_z=minutes_z,
            distance_z=distance_z,
            intensity_z=intensity_z,
            back_to_back=back_to_back_flag,
            high_games=high_games_flag,
        )
        explanation = self._explain(
            player_name=player_name,
            zone=zone,
            recent=recent,
            minutes_z=minutes_z,
            minutes_mean=minutes_mean,
            distance_z=distance_z,
            distance_mean=distance_mean,
            intensity_z=intensity_z,
            intensity_mean=intensity_mean,
        )

        return {
            "playerId": player_id,
            "playerName": player_name,
            "sport": sport,
            "riskScore": risk_score,
            "zone": zone,
            "triggerMetric": trigger,
            "minutesZScore": _round3(minutes_z),
            "distanceZScore": _round3(distance_z),
            "intensityZScore": _round3(intensity_z),
            "backToBackFlag": back_to_back_flag,
            "baselineMeanMinutes": _round2(minutes_mean),
            "baselineStdMinutes": _round2(minutes_std),
            "explanation": explanation,
            "windowStart": (recent_start + timedelta(days=1)).isoformat(),
            "windowEnd": ref.isoformat(),
            "dataPointsUsed": len(baseline),
            "computedAt": datetime.now(UTC).isoformat(),
        }

    # -- internals ---------------------------------------------------------------

    def _pick_trigger(
        self,
        minutes_z: float | None,
        distance_z: float | None,
        intensity_z: float | None,
        back_to_back: bool,
        high_games: bool,
    ) -> str | None:
        """The metric with the highest z-score above 1.5; falls back to
        backToBack / high game volume; None when nothing flagged."""
        candidates = [
            (name, z)
            for name, z in (("minutes", minutes_z), ("distance", distance_z), ("intensity", intensity_z))
            if z is not None and z > ZSCORE_ELEVATED
        ]
        if candidates:
            return max(candidates, key=lambda pair: pair[1])[0]
        if back_to_back:
            return "backToBack"
        if high_games:
            return "highGameVolume"
        return None

    def _explain(
        self,
        player_name: str | None,
        zone: str,
        recent: list[dict],
        minutes_z: float | None,
        minutes_mean: float | None,
        distance_z: float | None,
        distance_mean: float | None,
        intensity_z: float | None,
        intensity_mean: float | None,
    ) -> str:
        name = player_name or "This player"
        n = len(recent)
        parts: list[str] = []

        if minutes_z is not None and minutes_z > ZSCORE_ELEVATED and minutes_mean:
            pct = int(round((_mean(_metric_values(recent, "minutesPlayed")) - minutes_mean) / minutes_mean * 100))
            parts.append(f"{name} has played {pct}% more minutes than their personal average over the last {n} games")
        if distance_z is not None and distance_z > ZSCORE_ELEVATED and distance_mean:
            pct = int(
                round((_mean(_metric_values(recent, "distanceCovered")) - distance_mean) / distance_mean * 100)
            )
            parts.append(f"{name} has covered {pct}% more distance than their personal average over the last {n} games")
        if intensity_z is not None and intensity_z > ZSCORE_ELEVATED and intensity_mean:
            pct = int(
                round((_mean(_metric_values(recent, "highIntensityEvents")) - intensity_mean) / intensity_mean * 100)
            )
            parts.append(
                f"{name} has logged {pct}% more high-intensity events than their personal average over the last {n} games"
            )

        if any(bool(g.get("backToBack")) for g in recent):
            dates = ", ".join(_parse_date(g["date"]).isoformat() for g in recent if g.get("backToBack"))
            rest_hours = min(
                (int(g["daysRestBefore"]) * 24 for g in recent if g.get("backToBack") and g.get("daysRestBefore")),
                default=24,
            )
            parts.append(f"{name} played back to back games on {dates} with only {rest_hours} hours of rest")

        if not parts:
            parts.append(f"{name} is within their normal workload range over the last {n} games")

        return _zone_prefix(zone) + " and ".join(parts)

    def _insufficient(self, player_id: str, player_name: str | None, baseline_days: int, data_points: int) -> dict:
        return {
            "playerId": player_id,
            "playerName": player_name,
            "sport": None,
            "riskScore": None,
            "zone": "insufficient_data",
            "triggerMetric": None,
            "minutesZScore": None,
            "distanceZScore": None,
            "intensityZScore": None,
            "backToBackFlag": False,
            "baselineMeanMinutes": None,
            "baselineStdMinutes": None,
            "explanation": (
                f"Not enough game log data to compute a reliable baseline "
                f"(need at least {MIN_BASELINE_GAMES} games in the last {baseline_days} days, got {data_points})."
            ),
            "windowStart": None,
            "windowEnd": None,
            "dataPointsUsed": data_points,
            "computedAt": datetime.now(UTC).isoformat(),
        }


def _round2(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _round3(value: float | None) -> float | None:
    return None if value is None else round(value, 3)


def warmup() -> None:
    """Nothing heavy to load — the model is pure statistics."""
    logger.info("injury model warmup complete (statistics only)")
