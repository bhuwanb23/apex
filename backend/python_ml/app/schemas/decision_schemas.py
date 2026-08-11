# Decision EV model — Pydantic input/output shapes (Step 6).

from pydantic import BaseModel, Field


class GameContextInput(BaseModel):
    """The full game situation when a decision was made.

    The context is described from the DECISION TEAM's perspective:
    positive scoreDiff = the decision team is ahead; fieldPosition is the
    distance in yards to the opponent's goal line (0-100, lower = closer to
    scoring).
    """

    sport: str = Field(description="'NFL' | 'NBA' | 'MLB'")
    scoreDiff: int = Field(description="Score differential (decision team's perspective)")
    timeRemainingSeconds: float = Field(description="Game seconds remaining")
    period: int = Field(description="Quarter/period/inning number")
    down: int | None = Field(default=None, description="Down (NFL)")
    yardsToGo: int | None = Field(default=None, description="Yards to go (NFL)")
    fieldPosition: int | None = Field(default=None, description="Yards to opponent goal line 0-100 (NFL)")
    timeoutsRemaining: int | None = Field(default=None, description="Decision team's timeouts left")
    isHome: bool | None = Field(default=None, description="Is the decision team at home")


class DecisionEVRequest(BaseModel):
    sport: str = Field(description="'NFL' | 'NBA' | 'MLB'")
    decisionType: str = Field(description="'4th_down' | 'timeout' | '2pt_conversion' | 'shot_selection' | 'foul_strategy'")
    gameContext: GameContextInput = Field(description="The game situation")
    chosenAction: str = Field(description="What the coach actually did")
    availableActions: list[str] = Field(default_factory=list, description="Options that were available")


class AlternativeAction(BaseModel):
    action: str
    ev: float = Field(description="Expected value (win-probability units)")
    probSuccess: float | None = Field(default=None, ge=0, le=1)
    wpIfSuccess: float | None = Field(default=None, ge=0, le=1)
    wpIfFailure: float | None = Field(default=None, ge=0, le=1)


class DecisionEVResponse(BaseModel):
    decisionType: str
    evChosen: float = Field(description="EV of what the coach did")
    evBest: float = Field(description="EV of the best available option")
    evDifference: float = Field(description="evBest - evChosen (EV left on the table)")
    isOptimal: bool
    winProbBefore: float | None = Field(default=None, ge=0, le=1, description="Win probability before the decision")
    winProbabilityBefore: float | None = Field(default=None, ge=0, le=1, description="Alias of winProbBefore")
    allOptions: list[AlternativeAction] = Field(default_factory=list)
    explanation: str = Field(description="Plain English summary")
