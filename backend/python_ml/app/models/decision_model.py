# Decision EV Model (Step 6).
# Logistic-regression win probability model + EV per available action, then
# labels the coach's choice optimal or not. Skeleton only — implemented in Step 6.

from app.utils.logger import get_logger

logger = get_logger(__name__)


class DecisionEVModel:
    """Computes expected value for coaching decisions."""

    def compute(self, decision_type: str, chosen_action: str, context: dict) -> dict:
        """Returns the EV payload (see decision_schemas.DecisionEVResponse)."""
        raise NotImplementedError("decision_model compute() lands in Step 6")


def warmup() -> None:
    """Warms up the win-probability machinery / model cache."""
    logger.info("decision model warmup placeholder")
