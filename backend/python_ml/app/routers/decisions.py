# Decision EV routes (Step 6 wires the model).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.decision_model import DecisionEVModel
from app.schemas.decision_schemas import DecisionEVRequest, DecisionEVResponse

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.post(
    "/ev",
    response_model=DecisionEVResponse,
    summary="Compute EV for a coaching decision",
)
async def compute_decision_ev(request: DecisionEVRequest) -> DecisionEVResponse:
    """Expected value of the chosen action vs the best alternative."""
    try:
        result = DecisionEVModel().compute(
            request.decisionType,
            request.chosenAction,
            request.context.model_dump(),
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return DecisionEVResponse(**result)
