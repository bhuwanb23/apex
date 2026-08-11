# Decision EV routes (Step 6).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.decision_model import DecisionEVModel
from app.schemas.decision_schemas import DecisionEVRequest, DecisionEVResponse

router = APIRouter(prefix="/decisions", tags=["decisions"])

_model = DecisionEVModel()


@router.post(
    "/compute-ev",
    response_model=DecisionEVResponse,
    summary="Compute EV for a coaching decision",
)
async def compute_decision_ev(request: DecisionEVRequest) -> DecisionEVResponse:
    """Expected value of the chosen action vs the best available alternative.

    Runs the win-probability model on the current situation, evaluates every
    available action (success/failure outcomes), and reports which choice
    maximizes EV.
    """
    try:
        result = _model.compute(
            sport=request.sport,
            decision_type=request.decisionType,
            chosen_action=request.chosenAction,
            context=request.gameContext.model_dump(),
            available_actions=request.availableActions,
        )
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DecisionEVResponse(**result)
