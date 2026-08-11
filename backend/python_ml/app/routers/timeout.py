# Timeout optimizer routes (Step 8 wires the model).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.timeout_model import TimeoutModel
from app.schemas.timeout_schemas import TimeoutRequest, TimeoutResponse

router = APIRouter(prefix="/timeout", tags=["timeout"])


@router.post(
    "/recommend",
    response_model=TimeoutResponse,
    summary="Recommend whether to call a timeout",
)
async def timeout_recommendation(request: TimeoutRequest) -> TimeoutResponse:
    """Should the coach call a timeout right now?"""
    try:
        result = TimeoutModel().recommend(
            sport=request.sport,
            consecutive_scores=request.consecutiveScores,
            score_diff=request.scoreDiff,
            time_remaining=request.timeRemaining,
            period=request.period,
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TimeoutResponse(**result)
