# NFL data bridge routes (Step 10 wires nfl_data_py).

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.data.nfl_bridge import fetch_schedule, fetch_season_plays

router = APIRouter(prefix="/nfl", tags=["nfl"])


class PlaysRequest(BaseModel):
    season: int = Field(description="Season year, e.g. 2024")
    week: int | None = Field(default=None, description="Optional week filter")
    team: str | None = Field(default=None, description="Optional team abbreviation filter")
    game_id: str | None = Field(default=None, description="Optional single-game filter")


@router.post("/plays", summary="Fetch NFL play-by-play via nfl_data_py")
async def nfl_plays(request: PlaysRequest) -> dict[str, Any]:
    """Node.js POSTs here for down-by-down play-by-play (fallback: ESPN scoring plays)."""
    try:
        if request.game_id is not None:
            # Single game: fetch the season and filter server-side.
            plays = await _fetch_all_plays(request)
            return {"plays": [p for p in plays if p.get("game_id") == request.game_id]}
        plays = await _fetch_all_plays(request)
        return {"plays": plays}
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


async def _fetch_all_plays(request: PlaysRequest) -> list[dict]:
    # Blocking nfl_data_py call — run in threadpool when implemented.
    return fetch_season_plays(request.season, week=request.week, team=request.team)


@router.post("/schedule", summary="Fetch NFL schedule via nfl_data_py")
async def nfl_schedule(payload: dict[str, int]) -> dict[str, Any]:
    """Season schedule (games + weeks) for the Node backend."""
    try:
        schedule = fetch_schedule(payload.get("season", 2024))
        return {"schedule": schedule}
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
