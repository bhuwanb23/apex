# Timeout optimizer — Pydantic input/output shapes (Step 8).

from pydantic import BaseModel, Field


class TimeoutRequest(BaseModel):
    sport: str = Field(description="'nfl' | 'nba' | 'mlb'")
    consecutiveScores: int = Field(default=0, description="Opponent consecutive scoring events")
    scoreDiff: int = Field(description="Current score difference")
    timeRemaining: float = Field(description="Seconds remaining in game")
    period: int = Field(description="Current period (5 = OT)")
    timeoutsAvailable: int = Field(default=2, ge=0, le=3, description="Timeouts the defense has left")


class TimeoutResponse(BaseModel):
    shouldCallTimeout: bool
    stopProbabilityWith: float = Field(ge=0, le=1)
    stopProbabilityWithout: float = Field(ge=0, le=1)
    probabilityDiff: float = Field(description="with - without")
    confidenceLevel: str = Field(description="'high' | 'medium' | 'low'")
    recommendationText: str


class TimeoutPrecomputeRequest(BaseModel):
    sport: str = Field(description="'NFL' | 'NBA' — scenario grid is per sport")


class TimeoutScenario(BaseModel):
    """One pre-computed scenario row — mirrors the TimeoutRecommendations
    table in the Node/Prisma database (sportId is resolved by Node)."""

    scenarioKey: str = Field(description="Stable hash of the 5 scenario dimensions")
    consecutiveScores: int
    scoreDiff: int
    timeRemaining: float
    period: int
    timeoutsAvailable: int
    shouldCallTimeout: bool
    stopProbabilityWith: float
    stopProbabilityWithout: float
    probabilityDiff: float
    recommendationText: str
    confidenceLevel: str
    computedAt: str = Field(description="ISO-8601 timestamp")


class TimeoutPrecomputeResponse(BaseModel):
    sport: str
    count: int = Field(description="Number of scenarios returned (2250)")
    scenarios: list[TimeoutScenario]
