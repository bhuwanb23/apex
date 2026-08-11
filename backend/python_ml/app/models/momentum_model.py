# Momentum Cox Model (Step 7).
# Cox proportional hazard model (lifelines) on scoring-event sequences:
# hazard coefficient, p-value, confidence intervals, significance, plus a
# per-game momentum timeline. Skeleton only — implemented in Step 7.

from app.utils.logger import get_logger

logger = get_logger(__name__)


class MomentumModel:
    """Fits Cox hazard on game sequences and builds momentum timelines."""

    def compute_season(self, sport: str, season: str, games: list[dict]) -> dict:
        """Returns season-level analysis (see momentum_schemas.MomentumSeasonResponse)."""
        raise NotImplementedError("momentum_model compute_season() lands in Step 7")

    def compute_game_timeline(self, game_id: str, events: list[dict]) -> dict:
        """Returns a game timeline (see momentum_schemas.MomentumGameResponse)."""
        raise NotImplementedError("momentum_model compute_game_timeline() lands in Step 7")


def warmup() -> None:
    """Imports lifelines so the first real fit is fast."""
    logger.info("momentum model warmup placeholder")
