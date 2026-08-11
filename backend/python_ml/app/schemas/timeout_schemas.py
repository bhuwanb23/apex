# Timeout optimizer — Pydantic input/output shapes (Step 8 wires the model).

from pydantic import BaseModel, Field


class TimeoutRequest(BaseModel):
    sport: str = Field(description="'nfl' | 'nba' | 'mlb'")
    consecutiveScores: int = Field(default=0, description="Opponent consecutive scoring events")
    scoreDiff: int = Field(description="Current score difference")
    timeRemaining: float = Field(description="Seconds remaining in game")
    period: int = Field(description="Current period")


class TimeoutResponse(BaseModel):
    shouldCallTimeout: bool
    stopProbabilityWith: float = Field(ge=0, le=1)
    stopProbabilityWithout: float = Field(ge=0, le=1)
    probabilityDiff: float = Field(description="with - without")
    confidenceLevel: str = Field(description="'high' | 'medium' | 'low'")
    recommendationText: str
