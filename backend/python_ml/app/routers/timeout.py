# Timeout optimizer routes (Step 8) — single recommendation + batch precompute.

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.timeout_model import timeout_model
from app.schemas.timeout_schemas import (
    TimeoutPrecomputeRequest,
    TimeoutPrecomputeResponse,
    TimeoutRequest,
    TimeoutResponse,
    TimeoutScenario,
)

router = APIRouter(prefix="/timeout", tags=["timeout"])


@router.post(
    "/recommend",
    response_model=TimeoutResponse,
    summary="Recommend whether to call a timeout in the current situation",
)
async def timeout_recommendation(request: TimeoutRequest) -> TimeoutResponse:
    """Should the coach call a timeout right now?"""
    try:
        result = timeout_model.recommend(
            sport=request.sport,
            consecutive_scores=request.consecutiveScores,
            score_diff=request.scoreDiff,
            time_remaining=request.timeRemaining,
            period=request.period,
            timeouts_available=request.timeoutsAvailable,
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TimeoutResponse(**result)


@router.post(
    "/precompute",
    response_model=TimeoutPrecomputeResponse,
    summary="Pre-compute all timeout scenarios for a sport (2250 rows)",
)
async def timeout_precompute(request: TimeoutPrecomputeRequest) -> TimeoutPrecomputeResponse:
    """Batch pre-computation — Node writes the returned scenarios into the
    TimeoutRecommendations table and serves them instantly."""
    try:
        scenarios = timeout_model.precompute(sport=request.sport)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TimeoutPrecomputeResponse(
        sport=request.sport,
        count=len(scenarios),
        scenarios=[TimeoutScenario(**s) for s in scenarios],
    )
