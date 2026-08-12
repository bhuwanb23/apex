# Injury model — Pydantic input/output shapes (Step 5).

from pydantic import BaseModel, Field


class GameLogInput(BaseModel):
    """One player-game workload row (mirrors PlayerGameLogs fields used by the model)."""

    date: str = Field(description="Game date (YYYY-MM-DD)")
    minutesPlayed: float | None = Field(default=None, description="Decimal minutes played")
    distanceCovered: float | None = Field(default=None, description="Distance in miles/km if tracked")
    highIntensityEvents: int | None = Field(default=None, description="Sprints/jumps/hard cuts if tracked")
    backToBack: bool = Field(default=False, description="Was this the second game on consecutive days")
    daysRestBefore: int | None = Field(default=None, description="Calendar days since previous game")


class InjuryRiskRequest(BaseModel):
    playerId: str = Field(description="External player id")
    playerName: str | None = Field(default=None, description="Used in explanation text")
    sport: str = Field(default="NBA", description="'NBA' | 'NFL' | 'MLB'")
    gameLogs: list[GameLogInput] = Field(description="The player's game logs")
    windowDays: int = Field(default=7, ge=1, description="Recent analysis window in days")
    baselineDays: int = Field(default=21, ge=1, description="Personal baseline window in days")


class InjuryRiskResponse(BaseModel):
    playerId: str
    riskScore: float | None = Field(default=None, ge=0, le=100, description="Composite 0-100 risk score; null = insufficient data")
    zone: str = Field(description="'green' | 'yellow' | 'red' | 'insufficient_data'")
    triggerMetric: str | None = Field(default=None, description="Which metric caused the flag")
    minutesZScore: float | None = Field(default=None)
    distanceZScore: float | None = Field(default=None)
    intensityZScore: float | None = Field(default=None)
    backToBackFlag: bool = Field(default=False)
    baselineMeanMinutes: float | None = Field(default=None)
    baselineStdMinutes: float | None = Field(default=None)
    explanation: str = Field(description="Plain English explanation")
    windowStart: str | None = Field(default=None, description="Start of the recent analysis window")
    windowEnd: str | None = Field(default=None, description="End of the recent analysis window")
    dataPointsUsed: int = Field(default=0, description="Number of games in the baseline window")
    computedAt: str = Field(description="ISO timestamp")


class InjuryRiskBatchRequest(BaseModel):
    """Many players in one call — the risk job sends 25-player batches."""

    players: list[InjuryRiskRequest] = Field(description="Players to evaluate")


class InjuryRiskBatchResponse(BaseModel):
    """One result per input player, in the same order (never fails wholesale)."""

    results: list[InjuryRiskResponse] = Field(description="One result per input player")

