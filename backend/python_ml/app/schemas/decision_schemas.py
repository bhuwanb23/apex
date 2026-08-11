# Decision EV model — Pydantic input/output shapes (Step 6 wires the model).

from pydantic import BaseModel, Field


class GameContextInput(BaseModel):
    """The full game situation when a decision was made."""

    sport: str = Field(description="'nfl' | 'nba' | 'mlb'")
    scoreDiff: int = Field(description="Score differential at decision point")
    secondsRemaining: float = Field(description="Game seconds remaining")
    period: int = Field(description="Quarter/period/inning number")
    down: int | None = Field(default=None, description="Down (football)")
    yardsToGo: int | None = Field(default=None, description="Yards to go (football)")
    yardLine: int | None = Field(default=None, description="Field position (football)")


class DecisionEVRequest(BaseModel):
    decisionType: str = Field(description="'4th_down' | 'timeout' | '2pt_conversion' ...")
    chosenAction: str = Field(description="What the coach actually did")
    context: GameContextInput = Field(description="The game situation")


class AlternativeAction(BaseModel):
    action: str
    ev: float
    winProbability: float | None = Field(default=None)


class DecisionEVResponse(BaseModel):
    decisionType: str
    evChosen: float
    evBest: float
    evDifference: float = Field(description="EV left on the table (best - chosen)")
    isOptimal: bool
    winProbabilityBefore: float | None = Field(default=None)
    winProbabilityAfter: float | None = Field(default=None)
    alternativeActions: list[AlternativeAction] = Field(default_factory=list)
    explanation: str = Field(description="Plain English explanation")
