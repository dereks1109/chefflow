// ---------------------------------------------------------------------------
// Orchestrator for LLM-assisted recipe creation.
//
// Two entry points share most of the plumbing:
//   - generateRecipeFromText  → user types a dish name; uses the chat model
//     from `useLlmSettingsStore` (default llama-3.3-70b-versatile).
//   - generateRecipeFromPhoto → user uploads a base64 data-URL image; uses
//     the hard-coded VISION_MODEL regardless of settings (the user's chosen
//     chat model may not be vision-capable).
//
// Both produce a fully-formed `Recipe` ready to drop into the existing
// `saveRecipe()` flow. Generated steps are stubbed with safe scheduler
// metadata (`kind:'active'`, `thermalClass:'normal'`, `allergenClass:'allergen-free'`,
// empty `dependsOn`) — those drive the heuristic scheduler that still works
// because it pattern-matches on step `text`. The LLM-driven scheduler from
// Plan 4 doesn't read those fields.
// ---------------------------------------------------------------------------

import type { Recipe, RecipeAnalysis, Ingredient, WorkflowStep } from '../../types';
import { randomId } from '../../util/id';
import { complete, GroqClientError } from '../../scheduler/llm/groqClient';
import {
  buildRecipeGenSystemPrompt,
  buildTextUserPrompt,
  buildPhotoUserMessage,
  buildAnalyzeSystemPrompt,
  buildAnalyzeUserPrompt,
} from './recipeGenPrompt';
import {
  parseLlmRecipe,
  parseLlmAnalysis,
  LlmRecipeValidationError,
  type LlmRecipe,
  type LlmStep,
  type LlmIngredient,
} from './recipeGenSchema';

export { GroqClientError, LlmRecipeValidationError };

/** Vision-capable model on Groq. Pinned independent of the user's chat model. */
export const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export interface GenerateFromTextInput {
  dish: string;
  portions?: number;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface GenerateFromPhotoInput {
  imageDataUrl: string;
  portions?: number;
  apiKey: string;
  model?: string;               // optional override; defaults to VISION_MODEL
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Text mode: dish name (+ optional portions) → fully populated Recipe. */
export async function generateRecipeFromText(input: GenerateFromTextInput): Promise<Recipe> {
  const systemPrompt = buildRecipeGenSystemPrompt();
  const userPrompt = buildTextUserPrompt({ dish: input.dish, portions: input.portions });

  const rawJson = await complete({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt,
    userPrompt,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });

  const llmRecipe = parseJsonAndValidate(rawJson);
  return buildRecipe(llmRecipe, 'llm-text');
}

export interface AnalyzeRecipeInput {
  recipe: Recipe;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Analyse an existing recipe: ask the LLM only for the analysis subset
 * (calories + tags + allergens) based on the recipe's current ingredients +
 * steps. Used by the Editor's "Analyse with AI" button so that after the user
 * has edited the recipe, the analysis reflects what they actually wrote.
 */
export async function analyzeRecipe(input: AnalyzeRecipeInput): Promise<RecipeAnalysis> {
  const systemPrompt = buildAnalyzeSystemPrompt();
  const userPrompt = buildAnalyzeUserPrompt(input.recipe);
  const rawJson = await complete({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt,
    userPrompt,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  const stripped = stripMarkdownFences(rawJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmRecipeValidationError(`LLM did not return valid JSON: ${message}`, 'root');
  }
  const llmAnalysis = parseLlmAnalysis(parsed);
  return {
    caloriesPerPortion: llmAnalysis.caloriesPerPortion,
    caloriesTotal: llmAnalysis.caloriesTotal,
    keyIngredientTags: llmAnalysis.keyIngredientTags,
    allergens: llmAnalysis.allergens,
    analyzedAt: Date.now(),
    source: 'llm-text',
  };
}

/** Photo mode: image data URL → fully populated Recipe via the vision model. */
export async function generateRecipeFromPhoto(input: GenerateFromPhotoInput): Promise<Recipe> {
  const systemPrompt = buildRecipeGenSystemPrompt();
  const userContent = buildPhotoUserMessage({
    imageDataUrl: input.imageDataUrl,
    portions: input.portions,
  });

  // Vision models historically may not honor JSON mode strictly; we still ask
  // for it (most Groq vision models do) but the validator tolerates wrapping.
  const rawJson = await complete({
    apiKey: input.apiKey,
    model: input.model ?? VISION_MODEL,
    systemPrompt,
    userContent,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });

  const llmRecipe = parseJsonAndValidate(rawJson);
  return buildRecipe(llmRecipe, 'llm-vision');
}

// ---------------------------------------------------------------------------
// Internal: parse → validate, with one fallback for stray markdown fences.
// Some vision models wrap JSON in ```json … ``` despite the request_format
// hint; strip that before erroring out.
// ---------------------------------------------------------------------------
function parseJsonAndValidate(rawJson: string): LlmRecipe {
  const stripped = stripMarkdownFences(rawJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmRecipeValidationError(`LLM did not return valid JSON: ${message}`, 'root');
  }
  return parseLlmRecipe(parsed);
}

function stripMarkdownFences(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  // strip an opening fence (```json or ```) and a trailing ``` if present
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Internal: hydrate an LlmRecipe into a domain Recipe. Mints ids, stamps
// timestamps, fills the analysis source + analyzedAt.
// ---------------------------------------------------------------------------
function buildRecipe(llm: LlmRecipe, source: 'llm-text' | 'llm-vision'): Recipe {
  const now = Date.now();
  const ingredients: Ingredient[] = llm.ingredients.map((it, i) => toIngredient(it, i));
  const steps: WorkflowStep[] = llm.steps.map((s, i) => toStep(s, i));
  return {
    id: randomId(),
    title: llm.title,
    originalYield: llm.originalYield,
    prepTime: llm.prepTime,
    cookTime: llm.cookTime,
    ingredients,
    steps,
    createdAt: now,
    updatedAt: now,
    analysis: {
      caloriesPerPortion: llm.analysis.caloriesPerPortion,
      caloriesTotal: llm.analysis.caloriesTotal,
      keyIngredientTags: llm.analysis.keyIngredientTags,
      allergens: llm.analysis.allergens,
      analyzedAt: now,
      source,
    },
  };
}

function toIngredient(it: LlmIngredient, idx: number): Ingredient {
  return {
    id: `i${idx + 1}`,
    raw: it.raw,
    amount: it.amount,
    unit: it.unit,
    name: it.name,
    isLocked: false,
  };
}

function toStep(s: LlmStep, idx: number): WorkflowStep {
  return {
    id: `s${idx + 1}`,
    text: s.text,
    durationSec: s.durationSec || undefined,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: s.phase,
  };
}
