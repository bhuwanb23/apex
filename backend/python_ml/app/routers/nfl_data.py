# NFL data bridge routes (Step 10) — exposes nfl_data_py over HTTP.
#
# Spec endpoints (GET, query params) for humans/frontends plus the existing
# POST endpoints Node.js already calls (Phase 3 contract). All handlers are
# plain sync def so the blocking nfl_data_py calls run in the threadpool.
#
# Error mapping (see _run_bridge):
#   503 — nfl_data_py not installed (NflDataUnavailableError)
#   502 — upstream network failure (ConnectionError / TimeoutError)
#   500 — anything else — genuine bugs surface instead of being masked

from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.data.nfl_bridge import (
    NflDataUnavailableError,
    fetch_rosters,
    fetch_schedule,
    fetch_season_plays,
)

router = APIRouter(prefix="/nfl", tags=["nfl"])


def _run_bridge(fn: Callable, *args: Any, **kwargs: Any) -> Any:
    """Runs a bridge fetch, mapping failures to the right HTTP status."""
    try:
        return fn(*args, **kwargs)
    except NflDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ConnectionError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail=f"NFL data source failed: {exc}") from exc


# -- spec GET endpoints -------------------------------------------------------


@router.get("/plays", summary="Fetch NFL play-by-play via nfl_data_py")
def nfl_plays_get(
    season: int = Query(description="Season year, e.g. 2024"),
    week: int | None = Query(default=None, description="Optional week filter"),
    team: str | None = Query(default=None, description="Optional team abbreviation filter"),
) -> dict[str, Any]:
    """Cleaned play-by-play array (NaN → null)."""
    return {"plays": _run_bridge(fetch_season_plays, season, week=week, team=team)}


@router.get("/rosters", summary="Fetch NFL rosters via nfl_data_py")
def nfl_rosters_get(
    season: int = Query(description="Season year, e.g. 2024"),
) -> dict[str, Any]:
    """All player roster data for a season."""
    return {"rosters": _run_bridge(fetch_rosters, season)}


@router.get("/schedules", summary="Fetch NFL season schedule via nfl_data_py")
def nfl_schedules_get(
    season: int = Query(description="Season year, e.g. 2024"),
) -> dict[str, Any]:
    """Full season schedule (games + weeks)."""
    return {"schedule": _run_bridge(fetch_schedule, season)}


# -- POST endpoints (existing Node contract, kept for compatibility) ---------


class PlaysRequest(BaseModel):
    season: int = Field(description="Season year, e.g. 2024")
    week: int | None = Field(default=None, description="Optional week filter")
    team: str | None = Field(default=None, description="Optional team abbreviation filter")
    game_id: str | None = Field(default=None, description="Optional single-game filter")


@router.post("/plays", summary="Fetch NFL play-by-play via nfl_data_py (POST)")
def nfl_plays_post(request: PlaysRequest) -> dict[str, Any]:
    """Node.js POSTs here for down-by-down play-by-play (fallback: ESPN scoring
    plays). Filters to a single game when game_id is provided."""
    plays = _run_bridge(fetch_season_plays, request.season, week=request.week, team=request.team)
    if request.game_id is not None:
        plays = [p for p in plays if str(p.get("game_id")) == str(request.game_id)]
    return {"plays": plays}


@router.post("/schedule", summary="Fetch NFL schedule via nfl_data_py (POST)")
def nfl_schedule_post(payload: dict[str, int]) -> dict[str, Any]:
    """Season schedule for the Node backend."""
    return {"schedule": _run_bridge(fetch_schedule, payload.get("season", 2024))}
