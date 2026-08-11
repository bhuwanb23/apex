# Momentum routes (Step 7 wires the model).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.momentum_model import MomentumModel
from app.schemas.momentum_schemas import (
    MomentumGameRequest,
    MomentumGameResponse,
    MomentumSeasonRequest,
    MomentumSeasonResponse,
)

router = APIRouter(prefix="/momentum", tags=["momentum"])


@router.post(
    "/game",
    response_model=MomentumGameResponse,
    summary="Compute momentum timeline for a game",
)
async def momentum_game(request: MomentumGameRequest) -> MomentumGameResponse:
    """Per-moment momentum scores for a single game."""
    try:
        result = MomentumModel().compute_game_timeline(
            request.gameId, [e.model_dump() for e in request.events]
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MomentumGameResponse(**result)


@router.post(
    "/season",
    response_model=MomentumSeasonResponse,
    summary="Fit Cox hazard model for a season",
)
async def momentum_season(request: MomentumSeasonRequest) -> MomentumSeasonResponse:
    """Season-level Cox proportional hazard analysis."""
    try:
        games = [g.model_dump() for g in request.games]
        result = MomentumModel().compute_season(request.sport, request.season, games)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MomentumSeasonResponse(**result)
