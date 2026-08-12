# Injury risk routes (Step 5 + Phase 6 batch endpoint).

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.injury_model import InjuryRiskModel
from app.schemas.injury_schemas import (
    InjuryRiskBatchRequest,
    InjuryRiskBatchResponse,
    InjuryRiskRequest,
    InjuryRiskResponse,
)

router = APIRouter(prefix="/injury", tags=["injury"])

_model = InjuryRiskModel()


def _compute_one(player: InjuryRiskRequest) -> InjuryRiskResponse:
    """Runs the model for one player and returns a full response — never raises
    (per-player failures become insufficient_data responses)."""
    try:
        result = _model.compute(
            player_id=player.playerId,
            player_name=player.playerName,
            sport=player.sport,
            game_logs=[g.model_dump() for g in player.gameLogs],
            window_days=player.windowDays,
            baseline_days=player.baselineDays,
        )
        return InjuryRiskResponse(**result)
    except (ValueError, ValidationError) as exc:
        # One bad player must not sink the other 24 in the batch.
        return InjuryRiskResponse(
            playerId=player.playerId,
            zone="insufficient_data",
            riskScore=None,
            explanation=f"Player evaluation failed: {exc}",
            computedAt=datetime.now(timezone.utc).isoformat(),
        )


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
    return _compute_one(request)


@router.post(
    "/compute-risk/batch",
    response_model=InjuryRiskBatchResponse,
    summary="Compute injury risk for many players in one call",
)
async def compute_injury_risk_batch(request: InjuryRiskBatchRequest) -> InjuryRiskBatchResponse:
    """Evaluates up to N players in one HTTP call (the risk job sends
    25-player batches). Results mirror the input order; a player whose
    evaluation fails comes back as `zone: insufficient_data` with an
    explanation — the batch never fails wholesale."""
    results = [_compute_one(player) for player in request.players]
    return InjuryRiskBatchResponse(results=results)
