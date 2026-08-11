# Injury risk routes (Step 5).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.injury_model import InjuryRiskModel
from app.schemas.injury_schemas import InjuryRiskRequest, InjuryRiskResponse

router = APIRouter(prefix="/injury", tags=["injury"])

_model = InjuryRiskModel()


@router.post(
    "/compute-risk",
    response_model=InjuryRiskResponse,
    summary="Compute injury risk for a player",
)
async def compute_injury_risk(request: InjuryRiskRequest) -> InjuryRiskResponse:
    """Z-score injury risk from the player's workload game logs.

    The model builds a personal baseline from the last `baselineDays` (21)
    of logs, compares the recent `windowDays` (7) window, and returns a
    0-100 composite risk score with a green/yellow/red zone and a plain
    English explanation. Returns `zone: insufficient_data` with a null
    risk score when there aren't enough games for a reliable baseline.
    """
    try:
        result = _model.compute(
            player_id=request.playerId,
            player_name=request.playerName,
            sport=request.sport,
            game_logs=[g.model_dump() for g in request.gameLogs],
            window_days=request.windowDays,
            baseline_days=request.baselineDays,
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return InjuryRiskResponse(**result)
