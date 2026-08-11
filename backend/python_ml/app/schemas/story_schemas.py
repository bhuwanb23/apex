# Story mode generator — Pydantic input/output shapes (Step 9).

from pydantic import BaseModel, Field


class StoryRequest(BaseModel):
    module: str = Field(description="'injury' | 'decisions' | 'momentum'")
    sport: str = Field(description="'NFL' | 'NBA' | 'MLB'")
    role: str = Field(default="analyst", description="'trainer' | 'coach' | 'analyst' | 'fan' | 'journalist'")
    entityId: str | None = Field(default=None, description="Player or coach identifier")
    entityName: str | None = Field(default=None, description="Human readable name of the entity")
    metrics: dict = Field(default_factory=dict, description="All relevant numbers to narrate")


class StoryResponse(BaseModel):
    storyText: str = Field(description="The full generated paragraph")
    headlineText: str = Field(description="One line headline")
    toneLabel: str = Field(description="'warning' | 'positive' | 'neutral'")
    generatedBy: str = Field(description="'template' | 'openai'")
    keyMetrics: dict = Field(default_factory=dict, description="Echo of the metrics used")
