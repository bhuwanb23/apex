# Injury risk routes (Step 5 wires the model).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.injury_model import InjuryRiskModel
from app.schemas.injury_schemas import InjuryRiskRequest, InjuryRiskResponse

router = APIRouter(prefix="/injury", tags=["injury"])


@router.post(
    "/score",
    response_model=InjuryRiskResponse,
    summary="Compute injury risk for a player",
)
async def compute_injury_risk(request: InjuryRiskRequest) -> InjuryRiskResponse:
    """Z-score injury risk from the player's last 21 days of game logs."""
    try:
        result = InjuryRiskModel().compute(request.playerId, [g.model_dump() for g in request.gameLogs])
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return InjuryRiskResponse(**result)
