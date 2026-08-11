# NFL data bridge (Step 10).
# Wrapper around nfl_data_py. Node.js cannot call nfl_data_py directly, so it
# POSTs to /nfl routes here and this module loads the raw play-by-play from
# the Python package. Skeleton for now — implemented in Step 10.

from app.utils.logger import get_logger

logger = get_logger(__name__)


def fetch_season_plays(
    season: int,
    week: int | None = None,
    team: str | None = None,
) -> list[dict]:
    """Fetch NFL play-by-play for a season (optionally filtered by week/team).

    Returns a list of raw nfl_data_py play dicts. Implemented in Step 10.
    """
    raise NotImplementedError("nfl_data_py bridge lands in Step 10")


def fetch_schedule(season: int) -> list[dict]:
    """Fetch NFL schedule for a season. Implemented in Step 10."""
    raise NotImplementedError("nfl_data_py schedule lands in Step 10")
