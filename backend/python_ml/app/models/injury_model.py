# Injury Risk Model (Step 5).
# Z-score based: personal baseline from the last 21 days of game logs vs the
# most recent 7 day window; composite risk score 0-100 with green/yellow/red
# zones and plain-English explanations. Skeleton only — implemented in Step 5.

from app.utils.logger import get_logger

logger = get_logger(__name__)


class InjuryRiskModel:
    """Computes a player's injury risk from workload game logs."""

    def compute(self, player_id: str, game_logs: list[dict]) -> dict:
        """Returns the risk payload (see injury_schemas.InjuryRiskResponse)."""
        raise NotImplementedError("injury_model compute() lands in Step 5")


def warmup() -> None:
    """Loads weights / fits nothing for a z-score model, but warms numpy/cache."""
    logger.info("injury model warmup placeholder")
