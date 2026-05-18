import type { KitchenEvent, Recipe, ScheduledStep, WorkflowStep } from '../../types';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { complete } from '../../llm/llmClient';
import { stripMarkdownFences } from '../../llm/stripMarkdownFences';
import { GroqClientError } from './groqClient';
import {
  parseLlmResponse,
  assertCoversEvent,
  LlmValidationError,
  type LlmStep,
} from './responseSchema';

// ---------------------------------------------------------------------------
// llmScheduler — the production entry point for Plan 4.
//
// Composes the system + user prompts, sends them to Groq (or any
// OpenAI-compatible endpoint via the injectable client), validates the JSON
// strictly, and maps each LlmStep onto a full ScheduledStep by looking up
// the underlying WorkflowStep for the metadata the LLM isn't asked to emit
// (kind, thermalClass, allergenClass, dependsOnStepIds — those are
// recipe-authoritative and shouldn't depend on the LLM).
// ---------------------------------------------------------------------------

export interface LlmScheduleInput {
  event: KitchenEvent;
  recipes: Map<string, Recipe>;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface LlmScheduleResult {
  steps: ScheduledStep[];
  /** Echoed back so the caller can audit which model produced the snapshot. */
  modelUsed: string;
}

export { GroqClientError, LlmValidationError };

export async function scheduleEventLLM(input: LlmScheduleInput): Promise<LlmScheduleResult> {
  const { event, recipes, apiKey, model, baseUrl, fetchImpl, signal } = input;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(event, recipes);

  const rawJson = await complete({
    endpoint: 'workflow',
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    baseUrl,
    fetchImpl,
    signal,
  });

  // JSON-mode is usually reliable, but Groq occasionally wraps the body in
  // ```json … ``` (esp. when the model is under load). Strip fences and any
  // prose preamble before parsing — the LlmValidationError path is reserved
  // for genuinely malformed bodies.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripMarkdownFences(rawJson));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmValidationError(`LLM did not return valid JSON: ${message}`, 'root');
  }

  const response = parseLlmResponse(parsedJson);

  // Only require coverage for dishes that have a recipe and aren't pre-prepared.
  // Pre-prepared dishes get a single placeholder; missing-recipe dishes too.
  const dishIdsRequiringCoverage = new Set(
    event.dishes
      .filter((d) => !d.isPrepared && d.recipeId && recipes.has(d.recipeId))
      .map((d) => d.id),
  );
  assertCoversEvent({
    steps: response.steps,
    dishIdsRequiringCoverage,
    serveAt: event.serveAt ?? '',
  });

  // Index recipe steps so we can pull non-LLM fields from the source of truth.
  const recipeStepIndex = buildRecipeStepIndex(event, recipes);

  const scheduled: ScheduledStep[] = response.steps.map((llmStep) =>
    toScheduledStep(llmStep, event, recipeStepIndex),
  );

  return { steps: scheduled, modelUsed: model };
}

// ---------------------------------------------------------------------------
// Internal: map an LlmStep onto a full ScheduledStep by joining with the
// authoritative recipe data. For synthesized sanitize / prepared / unknown
// steps we fill safe defaults — the LLM is allowed to invent those.
// ---------------------------------------------------------------------------

interface RecipeStepRef {
  dishId: string;
  dishLabel: string;
  recipeId: string;
  step: WorkflowStep;
}

function buildRecipeStepIndex(
  event: KitchenEvent,
  recipes: Map<string, Recipe>,
): Map<string, RecipeStepRef> {
  // Index by the synthesized id we expect from the LLM: `${dishId}:${recipeStepId}`.
  const idx = new Map<string, RecipeStepRef>();
  for (const dish of event.dishes) {
    if (!dish.recipeId) continue;
    const recipe = recipes.get(dish.recipeId);
    if (!recipe) continue;
    for (const step of recipe.steps) {
      idx.set(`${dish.id}:${step.id}`, {
        dishId: dish.id,
        dishLabel: dish.name,
        recipeId: recipe.id,
        step,
      });
    }
  }
  return idx;
}

function toScheduledStep(
  llmStep: LlmStep,
  event: KitchenEvent,
  recipeStepIndex: Map<string, RecipeStepRef>,
): ScheduledStep {
  const synthesizedId = `${llmStep.dishId}:${llmStep.recipeStepId}`;
  const ref = recipeStepIndex.get(synthesizedId);

  if (ref) {
    return {
      id: synthesizedId,
      dishId: ref.dishId,
      recipeId: ref.recipeId,
      recipeStepId: ref.step.id,
      dishLabel: ref.dishLabel,
      text: llmStep.text,
      startAt: llmStep.startAt,
      endAt: llmStep.endAt,
      durationSec: llmStep.durationSec,
      phase: llmStep.phase,
      kind: ref.step.kind,
      thermalClass: ref.step.thermalClass,
      allergenClass: ref.step.allergenClass,
      dependsOnStepIds: ref.step.dependsOn.map((d) => `${ref.dishId}:${d}`),
      warnings: llmStep.warnings,
      rulesApplied: llmStep.rulesApplied,
    };
  }

  // Synthesized step — sanitize injection, prepared-dish placeholder, etc.
  // We trust the LLM's phase + text and infer the rest as best we can.
  const dish = event.dishes.find((d) => d.id === llmStep.dishId);
  return {
    id: llmStep.stepId || synthesizedId,
    dishId: llmStep.dishId,
    recipeId: dish?.recipeId ?? '',
    recipeStepId: llmStep.recipeStepId,
    dishLabel: dish?.name ?? 'Kitchen',
    text: llmStep.text,
    startAt: llmStep.startAt,
    endAt: llmStep.endAt,
    durationSec: llmStep.durationSec,
    phase: llmStep.phase,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOnStepIds: [],
    warnings: llmStep.warnings,
    rulesApplied: llmStep.rulesApplied,
  };
}
