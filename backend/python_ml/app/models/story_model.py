# Story Mode Generator (Step 9).
# Template/rule-based narrative builder; optionally calls OpenAI for richer
# text when an API key is present. Skeleton only — implemented in Step 9.

from app.utils.logger import get_logger

logger = get_logger(__name__)


class StoryModel:
    """Generates plain-English story paragraphs for a module view."""

    def generate(self, module: str, sport: str, role: str, entity_id: str | None, key_metrics: dict) -> dict:
        """Returns the story (see story_schemas.StoryResponse)."""
        raise NotImplementedError("story_model generate() lands in Step 9")


def warmup() -> None:
    """Pre-loads the story templates."""
    logger.info("story model warmup placeholder")
