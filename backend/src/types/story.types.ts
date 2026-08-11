/**
 * Story module types (Phase 5, Step 2).
 * Field names mirror the Python POST /story/generate contract (Pydantic
 * StoryRequest / StoryResponse).
 */
import type { SportAbbreviation, UserRole } from './shared.types.js';

/** Request body for story generation (mirrors the Python schema). */
export interface StoryRequest {
  module: string; // 'injury' | 'decisions' | 'momentum'
  sport: SportAbbreviation;
  role: UserRole;
  entityId?: string | null;
  entityName?: string | null;
  /** All relevant numbers the generator should narrate. */
  metrics: Record<string, unknown>;
}

/** Generated narrative (mirrors the Python schema). */
export interface StoryResponse {
  storyText: string;
  headlineText: string;
  toneLabel: string; // 'warning' | 'positive' | 'neutral'
  generatedBy: string; // 'template' | 'openai'
  keyMetrics: Record<string, unknown>;
}
