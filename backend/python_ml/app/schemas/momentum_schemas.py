# Momentum Cox model — Pydantic input/output shapes (Step 7 wires the model).

from pydantic import BaseModel, Field


class ScoringEventInput(BaseModel):
    """One play/event in a game's sequence."""

    period: int = Field(description="Quarter/period/inning")
    gameTimeSeconds: float = Field(description="Seconds elapsed in game")
    isScoring: bool = Field(description="Did this event change the score")
    scoringTeam: str | None = Field(default=None, description="Team that scored, if any")
    scoreDiff: int = Field(default=0, description="Score differential after the event")


class MomentumGameRequest(BaseModel):
    gameId: str = Field(description="External game id")
    events: list[ScoringEventInput] = Field(description="Ordered event sequence for the game")


class MomentumPoint(BaseModel):
    gameTimeSeconds: float
    homeMomentum: float
    awayMomentum: float


class MomentumGameResponse(BaseModel):
    gameId: str
    timeline: list[MomentumPoint] = Field(default_factory=list)
    peakHomeMomentum: float
    peakAwayMomentum: float
    momentumShifts: int
    explanation: str


class MomentumSeasonRequest(BaseModel):
    sport: str
    season: str
    games: list[MomentumGameRequest] = Field(description="Games to fit the Cox hazard model on")


class MomentumSeasonResponse(BaseModel):
    sport: str
    season: str
    hazardCoefficient: float
    pValue: float
    confidenceIntervalLow: float
    confidenceIntervalHigh: float
    isSignificant: bool
    effectSize: float | None = Field(default=None)
    hazardRateChange: float | None = Field(default=None)
    plainExplanation: str
    shortExplanation: str
