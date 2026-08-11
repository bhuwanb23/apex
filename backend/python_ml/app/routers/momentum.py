# Momentum routes (Step 7) — Cox hazard season analysis + per-game timeline.

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.data.model_cache import model_cache
from app.models.momentum_model import CACHE_KEY_PREFIX, MomentumModel
from app.schemas.momentum_schemas import (
    MomentumGameRequest,
    MomentumGameResponse,
    MomentumSeasonRequest,
    MomentumSeasonResponse,
)

router = APIRouter(prefix="/momentum", tags=["momentum"])


def _sport_hazard_weight(sport: str | None) -> float | None:
    """Returns the fitted hazard ratio for a sport if a season model is
    cached, else None (timeline falls back to a neutral weight of 1.0)."""
    if not sport:
        return None
    cached = model_cache.get(f"{CACHE_KEY_PREFIX}:{sport.lower()}")
    if not cached:
        return None
    return cached["hazard_ratio"]


@router.post(
    "/compute-season",
    response_model=MomentumSeasonResponse,
    summary="Fit Cox hazard model on a season of play-by-play",
)
async def momentum_compute_season(request: MomentumSeasonRequest) -> MomentumSeasonResponse:
    """Season-level Cox proportional hazard analysis.

    Body: {sport, season, plays: [{gameId, eventTimeSeconds, teamId,
    isScoring, homeScore, awayScore, period, description}]}
    """
    try:
        result = MomentumModel().compute_season(
            request.sport, request.season, [e.model_dump() for e in request.plays]
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MomentumSeasonResponse(**result)


@router.post(
    "/compute-game",
    response_model=MomentumGameResponse,
    summary="Compute momentum timeline for a single game",
)
async def momentum_compute_game(request: MomentumGameRequest) -> MomentumGameResponse:
    """Per-moment momentum scores for one game, weighted by the sport's
    fitted hazard ratio when a season model is cached.

    Body: {gameId, plays: [...], sport?: 'NFL' | 'NBA' | 'MLB'}
    """
    try:
        result = MomentumModel().compute_game_timeline(
            request.gameId,
            [e.model_dump() for e in request.plays],
            hazard_weight=_sport_hazard_weight(request.sport),
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MomentumGameResponse(**result)
