# Injury model — Pydantic input/output shapes (Step 5 wires the model).

from pydantic import BaseModel, Field


class GameLogInput(BaseModel):
    """One player-game workload row (mirrors PlayerGameLogs fields used by the model)."""

    date: str = Field(description="Game date (YYYY-MM-DD)")
    minutesPlayed: float | None = Field(default=None, description="Decimal minutes played")
    distanceCovered: float | None = Field(default=None, description="Distance in miles/km if tracked")
    highIntensityEvents: int | None = Field(default=None, description="Sprints/jumps/hard cuts if tracked")
    backToBack: bool = Field(default=False, description="Was this the second game on consecutive days")


class InjuryRiskRequest(BaseModel):
    playerId: str = Field(description="External player id")
    gameLogs: list[GameLogInput] = Field(description="The player's game logs (model uses last 21 days)")


class MetricZScore(BaseModel):
    metric: str
    value: float | None
    baselineMean: float | None
    baselineStd: float | None
    zScore: float | None


class InjuryRiskResponse(BaseModel):
    playerId: str
    riskScore: float = Field(ge=0, le=100, description="Composite 0-100 risk score")
    zone: str = Field(description="'green' | 'yellow' | 'red'")
    triggerMetric: str | None = Field(default=None, description="Which metric caused the flag")
    zScores: list[MetricZScore] = Field(default_factory=list)
    explanation: str = Field(description="Plain English explanation")
    computedAt: str = Field(description="ISO timestamp")
