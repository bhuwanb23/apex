# NFL data bridge (Step 10).
#
# Wrapper around nfl_data_py, exposed to Node.js as HTTP endpoints (Node
# cannot import Python packages). The library is not a hard dependency —
# nfl_data_py 0.3.3 pins pandas<2.0 which cannot run on Python 3.13, and the
# package is archived upstream, so it is NOT in requirements.txt.
#
# Data sources, in order:
#   1. nfl_data_py — used when importable (a compatible environment).
#   2. Local dataset — app/data/nfl_local/{plays,rosters,schedule}.json,
#      exported from the backend DB (backend/scripts/build-training-data.ts).
#      The plays are stored in nflfastR shape (game_id, down, ydstogo,
#      yardline_100, play_type, posteam, score_differential,
#      game_seconds_remaining, qtr, timeout, ...) plus season/week, so the
#      HTTP contract is identical. This keeps /nfl endpoints live without the
#      dead dependency. /health reports `nflDataAvailable` true whenever
#      either source is available.
#
# Data cleaning: nfl_data_py returns pandas DataFrames. We convert to lists
# of dicts with NaN replaced by None — NaN is not valid JSON, None becomes
# null. This is critical for the HTTP contract.

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.utils.logger import get_logger

logger = get_logger(__name__)

# Cached module reference. `False` is the "import failed" sentinel so we don't
# hammer the import machinery on every request; a server restart picks up a
# freshly installed library.
_nfl_data_py: Any | None | bool = None

# Local fallback dataset (exported from the backend DB). nfl_bridge.py lives
# in app/data/, so parents[2] is the python_ml root.
LOCAL_DATA_DIR = Path(__file__).resolve().parents[2] / "app" / "data" / "nfl_local"
LOCAL_FILES = {
    "plays": LOCAL_DATA_DIR / "plays.json",
    "rosters": LOCAL_DATA_DIR / "rosters.json",
    "schedule": LOCAL_DATA_DIR / "schedule.json",
}


class NflDataUnavailableError(RuntimeError):
    """Raised when neither nfl_data_py nor the local dataset is available."""


def _module() -> Any | None:
    """Lazily imports nfl_data_py once; returns None when unavailable."""
    global _nfl_data_py  # noqa: PLW0603 — module-level lazy singleton
    if _nfl_data_py is None:
        try:
            import importlib

            _nfl_data_py = importlib.import_module("nfl_data_py")
            logger.info("nfl_data_py loaded (%s)", getattr(_nfl_data_py, "__version__", "?"))
        except ImportError:
            logger.info(
                "nfl_data_py is not installed — using the local NFL dataset "
                "(app/data/nfl_local) exported from the backend DB"
            )
            _nfl_data_py = False
    return None if _nfl_data_py is False else _nfl_data_py


def _local_dataset(name: str) -> list[dict] | None:
    """Loads a local dataset file.

    Returns the rows when the file exists (possibly empty), None when the
    file itself is missing or unreadable (source genuinely unavailable).
    """
    path = LOCAL_FILES.get(name)
    if path is None or not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("records", [])
    except (json.JSONDecodeError, OSError) as exc:  # noqa: BLE001 — degraded source
        logger.warning("Local NFL dataset %s unreadable (%s)", path, exc)
        return None


def is_available() -> bool:
    """True when NFL data can be served (nfl_data_py OR the local dataset)."""
    if _module() is not None:
        return True
    return any(_local_dataset(name) is not None for name in LOCAL_FILES)


def _require() -> Any | None:
    """Returns nfl_data_py when importable, else None (callers use local data)."""
    return _module()


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


def _row_matches(row: dict, season: int | None, week: int | None, team: str | None) -> bool:
    """Local-dataset filter mirroring the nfl_data_py kwargs."""
    if season is not None:
        try:
            if int(row.get("season") or -1) != int(season):
                return False
        except (TypeError, ValueError):
            return False
    if week is not None:
        try:
            if int(row.get("week") or -1) != int(week):
                return False
        except (TypeError, ValueError):
            return False
    if team:
        candidates = [row.get("posteam"), row.get("team_abbr"), row.get("home_team"), row.get("away_team")]
        if team not in {str(c) for c in candidates if c is not None}:
            return False
    return True


def _local_plays(season: int, week: int | None, team: str | None) -> list[dict] | None:
    """Local plays filtered by season/week/team; None when no local dataset."""
    rows = _local_dataset("plays")
    if rows is None:
        return None
    return [r for r in rows if _row_matches(r, season, week, team)]


# -- fetch helpers ------------------------------------------------------------


def fetch_season_plays(
    season: int,
    week: int | None = None,
    team: str | None = None,
) -> list[dict]:
    """Play-by-play for a season, optionally filtered by week / team
    abbreviation (e.g. 'CIN'). nfl_data_py when available, else the local
    dataset (nflfastR-shaped plays exported from the backend DB)."""
    module = _require()
    if module is not None:
        df = module.import_pbp(
            seasons=[int(season)],
            weeks=[int(week)] if week is not None else None,
            teams=[team] if team else None,
        )
        return _clean(df)

    local = _local_plays(int(season), week, team)
    if local is not None:
        return local
    raise NflDataUnavailableError(
        "NFL data unavailable: nfl_data_py is not installed and the local dataset "
        f"has no plays for season {season}."
    )


def fetch_rosters(season: int) -> list[dict]:
    """All player rosters for a season (nfl_data_py.import_rosters or local)."""
    module = _require()
    if module is not None:
        return _clean(module.import_rosters(seasons=[int(season)]))
    local = _local_dataset("rosters")
    if local is not None:
        return [r for r in local if _row_matches(r, season, None, None)]
    raise NflDataUnavailableError(
        "NFL rosters unavailable: nfl_data_py is not installed and the local "
        "dataset has no rosters."
    )


def fetch_schedule(season: int) -> list[dict]:
    """Full season schedule (nfl_data_py.import_schedules or local)."""
    module = _require()
    if module is not None:
        return _clean(module.import_schedules(seasons=[int(season)]))
    local = _local_dataset("schedule")
    if local is not None:
        return [r for r in local if _row_matches(r, season, None, None)]
    raise NflDataUnavailableError(
        "NFL schedule unavailable: nfl_data_py is not installed and the local "
        "dataset has no schedule."
    )
