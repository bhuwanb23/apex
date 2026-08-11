/**
 * Story ML client — POSTs module metrics to the Python story generator
 * (POST /story/generate) and returns the narrative paragraph + headline.
 */
import { mlClient, type MLClient } from './ml.client.js';
import type { StoryRequest, StoryResponse } from '../types/story.types.js';

export interface StoryMLClient {
  generateStory(input: StoryRequest): Promise<StoryResponse>;
}

export function createStoryClient(client: MLClient = mlClient): StoryMLClient {
  return {
    generateStory: input => client.post<StoryResponse>('/story/generate', input),
  };
}

/** Shared instance — import this, don't construct your own (tests use createStoryClient). */
export const storyML = createStoryClient();
