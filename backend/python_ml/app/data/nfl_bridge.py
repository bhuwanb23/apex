# NFL data bridge (Step 10).
#
# Wrapper around nfl_data_py, exposed to Node.js as HTTP endpoints (Node
# cannot import Python packages). The library is not a hard dependency —
# nfl_data_py 0.3.3 pins pandas<2.0 which cannot run on Python 3.13, so it is
# NOT in requirements.txt. The bridge imports it lazily and every /nfl route
# degrades to a clean 503 ("nfl data unavailable") until it is installed in a
# compatible environment. /health reports `nflDataAvailable` from the same
# check so the Node side can route around it.
#
# Data cleaning: nfl_data_py returns pandas DataFrames. We convert to lists
# of dicts with NaN replaced by None — NaN is not valid JSON, None becomes
# null. This is critical for the HTTP contract.

from typing import Any

import pandas as pd

from app.utils.logger import get_logger

logger = get_logger(__name__)

# Cached module reference. `False` is the "import failed" sentinel so we don't
# hammer the import machinery on every request; a server restart picks up a
# freshly installed library.
_nfl_data_py: Any | None | bool = None


class NflDataUnavailableError(RuntimeError):
    """Raised when nfl_data_py cannot be imported (not installed)."""


def _module() -> Any | None:
    """Lazily imports nfl_data_py once; returns None when unavailable."""
    global _nfl_data_py  # noqa: PLW0603 — module-level lazy singleton
    if _nfl_data_py is None:
        try:
            import importlib

            _nfl_data_py = importlib.import_module("nfl_data_py")
            logger.info("nfl_data_py loaded (%s)", getattr(_nfl_data_py, "__version__", "?"))
        except ImportError:
            logger.warning(
                "nfl_data_py is not installed in this environment — "
                "/nfl endpoints will return 503 (see README for install notes)"
            )
            _nfl_data_py = False
    return None if _nfl_data_py is False else _nfl_data_py


def is_available() -> bool:
    """True when nfl_data_py can be imported (used by /health)."""
    return _module() is not None


def _require() -> Any:
    module = _module()
    if module is None:
        raise NflDataUnavailableError(
            "nfl_data_py is not installed in this environment. Install it in a "
            "pandas<2.0 compatible environment to enable NFL data endpoints."
        )
    return module


def _clean(df: pd.DataFrame | None) -> list[dict]:
    """DataFrame → list of dicts with NaN replaced by None (JSON-safe).

    `df.where(..., None)` alone is not enough: float64 columns cannot hold
    None, so pandas silently keeps NaN. Casting to object dtype first makes
    the replacement stick (the standard idiom).
    """
    if df is None or getattr(df, "empty", True):
        return []
    cleaned = df.astype(object).where(pd.notnull(df), None)
    return cleaned.to_dict("records")


# -- fetch helpers ------------------------------------------------------------


def fetch_season_plays(
    season: int,
    week: int | None = None,
    team: str | None = None,
) -> list[dict]:
    """Play-by-play for a season, optionally filtered by week / team
    abbreviation (e.g. 'CIN'). Delegates to nfl_data_py.import_pbp."""
    module = _require()
    df = module.import_pbp(
        seasons=[int(season)],
        weeks=[int(week)] if week is not None else None,
        teams=[team] if team else None,
    )
    return _clean(df)


def fetch_rosters(season: int) -> list[dict]:
    """All player rosters for a season (nfl_data_py.import_rosters)."""
    module = _require()
    return _clean(module.import_rosters(seasons=[int(season)]))


def fetch_schedule(season: int) -> list[dict]:
    """Full season schedule (nfl_data_py.import_schedules)."""
    module = _require()
    return _clean(module.import_schedules(seasons=[int(season)]))
