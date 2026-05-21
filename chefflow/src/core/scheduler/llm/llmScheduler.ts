import type { KitchenEvent, Recipe, ScheduledStep, WorkflowStep } from '../../types';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { complete } from '../../llm/llmClient';
import { stripMarkdownFences } from '../../llm/stripMarkdownFences';
import { GroqClientError } from './groqClient';
import { flattenSubRecipes } from '../../recipes/flattenSubRecipes';
import { scaleStepDurations } from '../scaleStepDurations';
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
  const { event, recipes: rawRecipes, apiKey, model, baseUrl, fetchImpl, signal } = input;

  // Expand sub-recipe references (Ingredient.componentRecipeId) into each
  // dish recipe's step list BEFORE prompting the LLM, so merged sauce steps
  // (etc.) appear in both the prompt and the step-index used to map the
  // response back. Namespaced step IDs survive the round-trip — see
  // flattenSubRecipes for the prefix scheme.
  const flattened = flattenAllRecipes(rawRecipes);

  // Apply per-dish portion scaling so the LLM sees step durations stretched
  // for larger dishes (e.g. Ribeye for 20 portions takes ~10× the active
  // step time of the same recipe authored for 2 portions). See
  // scaleEventForPortions below for the dish→recipe key remapping.
  const { event: scaledEvent, recipes } = scaleEventForPortions(event, flattened);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(scaledEvent, recipes);

  // From here on, use scaledEvent (dish.recipeId rewritten to dish.id) so
  // the response-mapping index lines up with what the LLM saw.
  const eventForResponse = scaledEvent;

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
    eventForResponse.dishes
      .filter((d) => !d.isPrepared && d.recipeId && recipes.has(d.recipeId))
      .map((d) => d.id),
  );
  assertCoversEvent({
    steps: response.steps,
    dishIdsRequiringCoverage,
    serveAt: eventForResponse.serveAt ?? '',
  });

  // Index recipe steps so we can pull non-LLM fields from the source of truth.
  const recipeStepIndex = buildRecipeStepIndex(eventForResponse, recipes);

  const scheduled: ScheduledStep[] = response.steps.map((llmStep) =>
    toScheduledStep(llmStep, eventForResponse, recipeStepIndex),
  );

  return { steps: scheduled, modelUsed: model };
}

/**
 * Flatten every recipe in the input map. The result map keys are unchanged
 * (each recipe id maps to its flattened version, which contains merged
 * sub-recipe steps prepended to its own steps).
 */
function flattenAllRecipes(rawRecipes: Map<string, Recipe>): Map<string, Recipe> {
  const flat = new Map<string, Recipe>();
  for (const [id, r] of rawRecipes) {
    flat.set(id, flattenSubRecipes(r, rawRecipes));
  }
  return flat;
}

/**
 * For each dish that links to a recipe, build a per-dish clone of that
 * recipe with step durations stretched to match the dish's portion count.
 * The returned event has each dish's `recipeId` rewritten to point at
 * `dish.id` (the new map key), so the same source recipe can be referenced
 * by two dishes at different portion counts without colliding.
 *
 * Dishes without a recipe link (prepared / missing) are returned unchanged
 * — their dish.recipeId stays as-is and they aren't added to the map.
 */
function scaleEventForPortions(
  event: KitchenEvent,
  flatRecipes: Map<string, Recipe>,
): { event: KitchenEvent; recipes: Map<string, Recipe> } {
  const dishScopedRecipes = new Map<string, Recipe>();
  const scaledDishes = event.dishes.map((dish) => {
    if (!dish.recipeId) return dish;
    const original = flatRecipes.get(dish.recipeId);
    if (!original) return dish;
    const denominator = original.originalYield > 0 ? original.originalYield : 1;
    const ratio = dish.portions / denominator;
    const scaledSteps = scaleStepDurations(original.steps, ratio);
    // Preserve the recipe's own id (so ScheduledStep.recipeId stays
    // referentially correct) but key the map by dish.id so two dishes that
    // share a recipe get independent scaled copies.
    dishScopedRecipes.set(dish.id, { ...original, steps: scaledSteps });
    return { ...dish, recipeId: dish.id };
  });
  return { event: { ...event, dishes: scaledDishes }, recipes: dishScopedRecipes };
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
    // Breadcrumb label for sub-recipe steps so the UI tag shows
    // "Ribeye > Black Pepper Sauce" instead of just the parent dish name.
    const dishLabel = ref.step.sourceRecipeTitle
      ? `${ref.dishLabel} > ${ref.step.sourceRecipeTitle}`
      : ref.dishLabel;
    return {
      id: synthesizedId,
      dishId: ref.dishId,
      recipeId: ref.recipeId,
      recipeStepId: ref.step.id,
      dishLabel,
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
