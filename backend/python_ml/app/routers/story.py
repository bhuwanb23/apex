# Story mode routes (Step 9 wires the model).

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.story_model import StoryModel
from app.schemas.story_schemas import StoryRequest, StoryResponse

router = APIRouter(prefix="/story", tags=["story"])


@router.post(
    "/generate",
    response_model=StoryResponse,
    summary="Generate story mode text",
)
async def generate_story(request: StoryRequest) -> StoryResponse:
    """Plain-English paragraph summarizing the current module view."""
    try:
        result = StoryModel().generate(
            module=request.module,
            sport=request.sport,
            role=request.role,
            entity_id=request.entityId,
            key_metrics=request.keyMetrics,
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StoryResponse(**result)
