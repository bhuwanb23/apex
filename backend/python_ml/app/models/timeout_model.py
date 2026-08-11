# Timeout Optimizer (Step 8).
# Decision-tree / rule-based model: stop-probability with vs without a timeout
# call, recommendation + confidence level for the current game situation.
# Skeleton only — implemented in Step 8.

from app.utils.logger import get_logger

logger = get_logger(__name__)


class TimeoutModel:
    """Recommends whether to call a timeout in a given situation."""

    def recommend(
        self,
        sport: str,
        consecutive_scores: int,
        score_diff: int,
        time_remaining: float,
        period: int,
    ) -> dict:
        """Returns the recommendation (see timeout_schemas.TimeoutResponse)."""
        raise NotImplementedError("timeout_model recommend() lands in Step 8")


def warmup() -> None:
    """Loads the timeout decision tree / rules from the cache."""
    logger.info("timeout model warmup placeholder")
