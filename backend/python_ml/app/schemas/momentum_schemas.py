# Momentum Cox model — Pydantic input/output shapes (Step 7).

from pydantic import BaseModel, Field


class MomentumPlayInput(BaseModel):
    """One play-by-play record (mirrors PlayByPlay rows from Node)."""

    gameId: str = Field(description="External game id")
    eventTimeSeconds: float = Field(description="Seconds elapsed in game")
    teamId: str | None = Field(default=None, description="Team that generated the event (external id)")
    isScoring: bool = Field(default=False, description="Did this event change the score")
    homeScore: int | None = Field(default=None, description="Home score at this moment")
    awayScore: int | None = Field(default=None, description="Away score at this moment")
    period: int = Field(default=1, description="Quarter/period/inning number")
    description: str | None = Field(default=None, description="Text description of the play (optional)")


class MomentumSeasonRequest(BaseModel):
    sport: str = Field(description="'NFL' | 'NBA' | 'MLB'")
    season: str = Field(description="Season identifier, e.g. '2024'")
    plays: list[MomentumPlayInput] = Field(description="Flat array of plays across games (each has gameId)")


class MomentumGameRequest(BaseModel):
    gameId: str = Field(description="External game id")
    plays: list[MomentumPlayInput] = Field(description="Plays for this single game, in sequence")
    sport: str | None = Field(
        default=None,
        description="Optional sport ('NFL' | 'NBA' | 'MLB') — uses the cached season hazard ratio as the momentum weight",
    )


class MomentumSeasonResponse(BaseModel):
    sport: str
    season: str
    hazardCoefficient: float | None = Field(default=None, description="Cox coefficient for consecutive scores")
    pValue: float | None = Field(default=None, description="Significance of the coefficient")
    confidenceIntervalLow: float | None = Field(default=None, description="95% CI lower bound (hazard ratio)")
    confidenceIntervalHigh: float | None = Field(default=None, description="95% CI upper bound (hazard ratio)")
    isSignificant: bool = Field(default=False, description="p < 0.05")
    effectSize: float | None = Field(default=None, description="Hazard ratio for consecutive scores")
    hazardRateChange: float | None = Field(default=None, description="% change in opponent hazard per consecutive score")
    gamesAnalyzed: int = Field(default=0)
    playsAnalyzed: int = Field(default=0)
    verdictLabel: str = Field(description="'significant' | 'not_significant' | 'insufficient_data'")
    plainExplanation: str = Field(description="Full plain English summary")
    shortExplanation: str = Field(description="One sentence summary")


class MomentumTimelineEvent(BaseModel):
    gameTimeSeconds: float
    homeMomentumScore: float
    awayMomentumScore: float
    eventDescription: str | None = Field(default=None)


class MomentumGameResponse(BaseModel):
    gameId: str
    homeTeamMomentum: list[float] = Field(default_factory=list, description="Home momentum score over time")
    awayTeamMomentum: list[float] = Field(default_factory=list, description="Away momentum score over time")
    timelineEvents: list[MomentumTimelineEvent] = Field(default_factory=list)
    peakHomeMomentum: float = Field(default=0)
    peakAwayMomentum: float = Field(default=0)
    momentumShifts: int = Field(default=0, description="How many times momentum changed hands")
    longestStreak: int = Field(default=0, description="Longest consecutive scoring streak by either team")
