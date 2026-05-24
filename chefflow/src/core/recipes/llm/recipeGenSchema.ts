// ---------------------------------------------------------------------------
// Validator for the recipe-generation LLM response.
//
// Strict on the structural fields (title / ingredients / steps) — those drive
// the editable Recipe. Lenient on `analysis` — missing fields become undefined
// or empty arrays, and unknown allergen strings are silently dropped so a
// drift in the LLM's vocabulary doesn't blow up the whole call.
//
// Mirrors src/core/scheduler/llm/responseSchema.ts in spirit: hand-rolled +
// path-carrying error + small focused surface.
// ---------------------------------------------------------------------------

import type { AllergenTag } from '../../types';
import { isAllergenTag } from './allergens';

export type LlmStepPhase = 'prep' | 'cook' | 'serve';

export interface LlmIngredient {
  raw: string;
  amount: number;
  unit: string;
  name: string;
}

export interface LlmStep {
  text: string;
  durationSec: number;
  phase: LlmStepPhase;
}

export interface LlmAnalysis {
  caloriesPerPortion?: number;
  caloriesTotal?: number;
  keyIngredientTags: string[];
  allergens: AllergenTag[];
  /** Ingredient names (lowercase, verbatim from the recipe) the LLM was
   *  unsure about. Surfaced as amber "AI to review" pills so the chef
   *  knows to verify them manually. Optional + tolerant — older responses
   *  without this field render no pill. */
  uncertainIngredients?: string[];
}

export interface LlmRecipe {
  title: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: LlmIngredient[];
  steps: LlmStep[];
  analysis: LlmAnalysis;
}

export class LlmRecipeValidationError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(`${message} (at ${path})`);
    this.name = 'LlmRecipeValidationError';
    this.path = path;
  }
}

const VALID_PHASES: ReadonlySet<string> = new Set(['prep', 'cook', 'serve']);

// ---------------------------------------------------------------------------
// parseLlmRecipe — strict on structure, lenient on analysis.
// ---------------------------------------------------------------------------
export function parseLlmRecipe(raw: unknown): LlmRecipe {
  if (!raw || typeof raw !== 'object') {
    throw new LlmRecipeValidationError('Response is not a JSON object', 'root');
  }
  const r = raw as Record<string, unknown>;

  const title = requireString(r, 'title', 'title');
  const originalYield = requirePositiveInt(r, 'originalYield', 'originalYield');
  const prepTime = optionalString(r, 'prepTime');
  const cookTime = optionalString(r, 'cookTime');

  if (!Array.isArray(r.ingredients)) {
    throw new LlmRecipeValidationError('Missing "ingredients" array', 'ingredients');
  }
  if (r.ingredients.length === 0) {
    throw new LlmRecipeValidationError('Recipe must have at least one ingredient', 'ingredients');
  }
  const ingredients = r.ingredients.map((it, i) => validateIngredient(it, `ingredients[${i}]`));

  if (!Array.isArray(r.steps)) {
    throw new LlmRecipeValidationError('Missing "steps" array', 'steps');
  }
  if (r.steps.length === 0) {
    throw new LlmRecipeValidationError('Recipe must have at least one step', 'steps');
  }
  const steps = r.steps.map((it, i) => validateStep(it, `steps[${i}]`));

  const analysis = validateAnalysis(r.analysis);

  return {
    title,
    originalYield,
    prepTime,
    cookTime,
    ingredients,
    steps,
    analysis,
  };
}

/**
 * Parse a *standalone* analysis response (the Analyse-with-AI button asks the
 * LLM for just the analysis subset, not a full recipe). Same leniency as the
 * embedded `validateAnalysis` — missing fields degrade to empty / undefined.
 */
export function parseLlmAnalysis(raw: unknown): LlmAnalysis {
  if (!raw || typeof raw !== 'object') {
    throw new LlmRecipeValidationError('Response is not a JSON object', 'root');
  }
  return validateAnalysis(raw);
}

// ---------------------------------------------------------------------------
// Field-level validators. Required-string helpers throw; optional ones return
// undefined when absent or empty.
// ---------------------------------------------------------------------------

function requireString(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new LlmRecipeValidationError(`Field "${key}" missing or not a non-empty string`, path);
  }
  return v.trim();
}

function optionalString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  if (typeof v !== 'string' || v.trim().length === 0) return undefined;
  return v.trim();
}

function requirePositiveInt(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
    throw new LlmRecipeValidationError(`Field "${key}" must be a positive integer`, path);
  }
  return v;
}

function validateIngredient(raw: unknown, path: string): LlmIngredient {
  if (!raw || typeof raw !== 'object') {
    throw new LlmRecipeValidationError('Ingredient is not an object', path);
  }
  const o = raw as Record<string, unknown>;
  const amount = o.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new LlmRecipeValidationError('Ingredient "amount" must be a non-negative number', path);
  }
  const unit = requireString(o, 'unit', path);
  const name = requireString(o, 'name', path);
  const rawStr = typeof o.raw === 'string' && o.raw.trim().length > 0
    ? o.raw.trim()
    : `{${amount}|${unit}|${name}}`;
  return { raw: rawStr, amount, unit, name };
}

function validateStep(raw: unknown, path: string): LlmStep {
  if (!raw || typeof raw !== 'object') {
    throw new LlmRecipeValidationError('Step is not an object', path);
  }
  const o = raw as Record<string, unknown>;
  const text = requireString(o, 'text', path);
  let durationSec = 0;
  if (o.durationSec !== undefined) {
    if (typeof o.durationSec !== 'number' || !Number.isFinite(o.durationSec) || o.durationSec < 0) {
      throw new LlmRecipeValidationError('Step "durationSec" must be a non-negative number', path);
    }
    durationSec = Math.round(o.durationSec);
  }
  let phase: LlmStepPhase = 'cook';
  if (typeof o.phase === 'string' && VALID_PHASES.has(o.phase)) {
    phase = o.phase as LlmStepPhase;
  }
  return { text, durationSec, phase };
}

function validateAnalysis(raw: unknown): LlmAnalysis {
  // Lenient: missing analysis becomes an empty stub. Callers stamp source +
  // analyzedAt afterwards regardless.
  if (!raw || typeof raw !== 'object') {
    return { keyIngredientTags: [], allergens: [] };
  }
  const a = raw as Record<string, unknown>;

  const caloriesPerPortion = sanitizeInteger(a.caloriesPerPortion);
  const caloriesTotal = sanitizeInteger(a.caloriesTotal);

  const keyIngredientTags = Array.isArray(a.keyIngredientTags)
    ? Array.from(
        new Set(
          a.keyIngredientTags
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim().toLowerCase()),
        ),
      )
    : [];

  const allergens: AllergenTag[] = Array.isArray(a.allergens)
    ? Array.from(new Set(a.allergens.filter(isAllergenTag)))
    : [];

  const uncertainIngredients: string[] = Array.isArray(a.uncertainIngredients)
    ? Array.from(
        new Set(
          a.uncertainIngredients
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim().toLowerCase()),
        ),
      )
    : [];

  return {
    caloriesPerPortion,
    caloriesTotal,
    keyIngredientTags,
    allergens,
    ...(uncertainIngredients.length > 0 ? { uncertainIngredients } : {}),
  };
}

function sanitizeInteger(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined;
  return Math.round(v);
}
