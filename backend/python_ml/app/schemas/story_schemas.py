# Story mode generator — Pydantic input/output shapes (Step 9 wires the model).

from pydantic import BaseModel, Field


class StoryRequest(BaseModel):
    module: str = Field(description="'injury' | 'decisions' | 'momentum'")
    sport: str = Field(description="'nfl' | 'nba' | 'mlb'")
    role: str = Field(default="analyst", description="Which role mode")
    entityId: str | None = Field(default=None, description="Player or coach the story is about")
    keyMetrics: dict = Field(default_factory=dict, description="The data points to narrate")


class StoryResponse(BaseModel):
    storyText: str = Field(description="The full generated paragraph")
    generatedBy: str = Field(description="'template' | 'openai'")
    keyMetrics: dict = Field(default_factory=dict)
