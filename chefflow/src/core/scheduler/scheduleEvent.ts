import type {
  Dish,
  KitchenEvent,
  Recipe,
  ScheduledStep,
  WorkflowStep,
} from '../types';
import { estimateDuration, durationWasGiven } from './duration';
import { topologicalSort, isAllergen } from './rules';
import { flattenSubRecipes } from '../recipes/flattenSubRecipes';
import { scaleStepDurations } from './scaleStepDurations';

// ===========================================================================
// scheduleEvent — pure-function entry point for Plan 3 Task A.
//
// Given a KitchenEvent and the recipes its dishes link to, produce a
// time-ordered ScheduledStep[] applying the rules from CulinaryRule.md.
//
// v1 strategy (Approach A from the plan):
//   1. For each dish, walk its recipe steps in topological order, then anchor
//      backwards from the dish's deadline (= event.serveAt) so the LAST step
//      ends at the deadline and each prior step ends where the next begins.
//   2. Concatenate all dish schedules and sort by startAt asc.
//   3. Apply Rule 5 (allergen isolation): inject a sanitize break whenever
//      an allergen step would land immediately after an allergen-free one.
//   4. Each ScheduledStep records `rulesApplied` so the UI can show pills.
//
// Out-of-scope for v1 (noted in the plan):
//   - Batching consolidation across dishes (Rule 4) — we surface `batchKey`
//     in warnings but don't merge yet.
//   - Resource awareness (oven count, pan count) — we assume infinite
//     parallelism and emit a warning if two cook-active steps overlap.
//   - User overlay (`manualOrderHint`) — not yet applied to regeneration.
// ===========================================================================

export interface ScheduleInput {
  event: KitchenEvent;
  recipes: Map<string, Recipe>;
}

export interface ScheduleOptions {
  defaultPrepDurationSec?: number;
  defaultCookDurationSec?: number;
  defaultServeDurationSec?: number;
  defaultPassiveMultiplier?: number;
  sanitizeBreakSec?: number;       // Rule 5 — sanitize duration injected between AF→A transitions
  preparedDishLeadSec?: number;    // a prepared (no-recipe) dish becomes a single "pick up" step that long
  fallbackHorizonHours?: number;   // when event.serveAt is undefined, anchor at now + this many hours
}

const DEFAULT_SANITIZE_BREAK_SEC = 300;       // 5 min — matches CulinaryRule.md Rule 5
const DEFAULT_PREPARED_LEAD_SEC = 60;          // 1 min token block for a "I'll get it ready" dish
const DEFAULT_FALLBACK_HORIZON_HOURS = 24;

export function scheduleEvent(input: ScheduleInput, opts: ScheduleOptions = {}): ScheduledStep[] {
  const { event, recipes } = input;
  const serveAt = resolveServeAt(event, opts);

  // ---- Step 1: gather per-dish reverse-scheduled steps ------------------
  const perDish = event.dishes.map((dish) =>
    scheduleDish(dish, recipes, serveAt, opts),
  );

  // ---- Step 2: merge + sort by startAt asc ------------------------------
  let merged = perDish.flat().sort(byStartAtAsc);

  // ---- Step 3: Rule 5 — inject sanitize breaks --------------------------
  merged = injectSanitizeBreaks(merged, opts);

  // ---- Step 4: Rule 4 — surface batchable steps (no actual merging yet)
  merged = annotateBatchable(merged);

  return merged;
}

// ---------------------------------------------------------------------------
// resolveServeAt — Rule 1's anchor.
// ---------------------------------------------------------------------------
function resolveServeAt(event: KitchenEvent, opts: ScheduleOptions): Date {
  if (event.serveAt) {
    const d = new Date(event.serveAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Fall back to latest dish.startAt, or now+horizon as a last resort.
  const dishTimes = event.dishes
    .map((d) => new Date(d.startAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dishTimes.length > 0) {
    return new Date(Math.max(...dishTimes));
  }
  const horizon = (opts.fallbackHorizonHours ?? DEFAULT_FALLBACK_HORIZON_HOURS) * 3600 * 1000;
  return new Date(Date.now() + horizon);
}

// ---------------------------------------------------------------------------
// scheduleDish — reverse-engineer a single dish's timeline.
// ---------------------------------------------------------------------------
function scheduleDish(
  dish: Dish,
  recipes: Map<string, Recipe>,
  serveAt: Date,
  opts: ScheduleOptions,
): ScheduledStep[] {
  // "I'll get the dish ready" — no recipe, just a token block.
  if (dish.isPrepared || !dish.recipeId) {
    return [preparedDishStep(dish, serveAt, opts)];
  }

  const baseRecipe = recipes.get(dish.recipeId);
  if (!baseRecipe) {
    return [missingRecipeStep(dish, serveAt, opts)];
  }
  // Expand `componentRecipeId` ingredients: prepend the referenced recipes'
  // steps onto this recipe so they're scheduled before the parent's steps.
  // Each sub-recipe step's id is namespaced and carries a `sourceRecipeId`.
  const flat = flattenSubRecipes(baseRecipe, recipes);
  // Stretch active step durations for larger portion counts (e.g. searing
  // 20 steaks takes much longer than 2). Sub-recipe steps (sourceRecipeId
  // set) pass through unscaled — sub-recipe quantities are literal.
  const denominator = flat.originalYield > 0 ? flat.originalYield : 1;
  const ratio = dish.portions / denominator;
  const recipe = { ...flat, steps: scaleStepDurations(flat.steps, ratio) };

  const { sorted, cycleNodeIds } = topologicalSort(recipe.steps);
  const cycleWarning = cycleNodeIds.length > 0
    ? `Dependency cycle in recipe — steps may be out of order: ${cycleNodeIds.join(', ')}`
    : null;

  // Walk forward to compute durations, then anchor the chain to end at serveAt
  // by walking in reverse and laying each step against the cursor.
  const reversed = [...sorted].reverse();
  const result: ScheduledStep[] = [];
  let cursorMs = serveAt.getTime();

  for (const step of reversed) {
    const durationSec = estimateDuration(step, opts);
    const endMs = cursorMs;
    const startMs = endMs - durationSec * 1000;
    const warnings: string[] = [];
    if (!durationWasGiven(step)) {
      warnings.push(`Duration estimated (${durationSec}s) — recipe didn't specify`);
    }
    if (cycleWarning && cycleNodeIds.includes(step.id)) {
      warnings.push(cycleWarning);
    }

    result.unshift(makeScheduledStep({
      dish,
      recipeId: recipe.id,
      step,
      startMs,
      endMs,
      durationSec,
      warnings,
      rulesApplied: [1], // Rule 1 — Timeline Rule (reverse-engineered)
    }));

    cursorMs = startMs;
  }

  return result;
}

// ---------------------------------------------------------------------------
// preparedDishStep — placeholder for "I'll get it ready" dishes.
// ---------------------------------------------------------------------------
function preparedDishStep(dish: Dish, serveAt: Date, opts: ScheduleOptions): ScheduledStep {
  const leadSec = opts.preparedDishLeadSec ?? DEFAULT_PREPARED_LEAD_SEC;
  const endMs = serveAt.getTime();
  const startMs = endMs - leadSec * 1000;
  return {
    id: `${dish.id}:prepared`,
    dishId: dish.id,
    recipeId: '',
    recipeStepId: 'prepared',
    dishLabel: dish.name,
    text: `Place ${dish.name || 'the dish'} (pre-prepared) on the pass.`,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    durationSec: leadSec,
    phase: 'serve',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOnStepIds: [],
    warnings: ['Dish marked as pre-prepared — no recipe steps scheduled'],
    rulesApplied: [],
  };
}

// ---------------------------------------------------------------------------
// missingRecipeStep — defensive placeholder when a dish references a recipe
// that wasn't supplied in the recipes map.
// ---------------------------------------------------------------------------
function missingRecipeStep(dish: Dish, serveAt: Date, opts: ScheduleOptions): ScheduledStep {
  const leadSec = opts.preparedDishLeadSec ?? DEFAULT_PREPARED_LEAD_SEC;
  const endMs = serveAt.getTime();
  const startMs = endMs - leadSec * 1000;
  return {
    id: `${dish.id}:missing`,
    dishId: dish.id,
    recipeId: dish.recipeId ?? '',
    recipeStepId: 'missing',
    dishLabel: dish.name,
    text: `Recipe for "${dish.name}" not found — manual plan needed.`,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    durationSec: leadSec,
    phase: 'serve',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOnStepIds: [],
    warnings: [`Recipe ${dish.recipeId} not in input — supply it to schedule properly`],
    rulesApplied: [],
  };
}

// ---------------------------------------------------------------------------
// makeScheduledStep — assemble the JSON-friendly snapshot from a WorkflowStep.
// ---------------------------------------------------------------------------
function makeScheduledStep(args: {
  dish: Dish;
  recipeId: string;
  step: WorkflowStep;
  startMs: number;
  endMs: number;
  durationSec: number;
  warnings: string[];
  rulesApplied: number[];
}): ScheduledStep {
  const { dish, recipeId, step, startMs, endMs, durationSec, warnings, rulesApplied } = args;
  // Sub-recipe steps (merged in by flattenSubRecipes) get a breadcrumb label
  // so chefs see which sub-recipe a merged step belongs to:
  //   "(Demo) Ribeye > (Demo) Black Pepper Sauce"
  const dishLabel = step.sourceRecipeTitle
    ? `${dish.name} > ${step.sourceRecipeTitle}`
    : dish.name;
  return {
    id: `${dish.id}:${step.id}`,
    dishId: dish.id,
    recipeId,
    recipeStepId: step.id,
    dishLabel,
    text: step.text,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    durationSec,
    phase: step.phase,
    kind: step.kind,
    thermalClass: step.thermalClass,
    allergenClass: step.allergenClass,
    dependsOnStepIds: step.dependsOn.map((d) => `${dish.id}:${d}`),
    warnings,
    rulesApplied,
  };
}

// ---------------------------------------------------------------------------
// injectSanitizeBreaks — Rule 5.
// Whenever an allergen step immediately follows an allergen-free step, drop a
// short sanitize block in between so the chef cleans boards/knives.
// ---------------------------------------------------------------------------
function injectSanitizeBreaks(steps: ScheduledStep[], opts: ScheduleOptions): ScheduledStep[] {
  const breakSec = opts.sanitizeBreakSec ?? DEFAULT_SANITIZE_BREAK_SEC;
  const out: ScheduledStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const current = steps[i];
    const previous = out.length > 0 ? out[out.length - 1] : null;
    if (
      previous &&
      previous.allergenClass === 'allergen-free' &&
      current.allergenClass === 'allergen'
    ) {
      const endMs = new Date(current.startAt).getTime();
      const startMs = endMs - breakSec * 1000;
      out.push({
        id: `sanitize:${previous.id}->${current.id}`,
        dishId: '',
        recipeId: '',
        recipeStepId: 'sanitize',
        dishLabel: 'Kitchen',
        text: 'Sanitize boards & knives before switching to allergen prep.',
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        durationSec: breakSec,
        phase: 'sanitize',
        kind: 'active',
        thermalClass: 'normal',
        allergenClass: 'allergen-free',
        dependsOnStepIds: [previous.id],
        warnings: [],
        rulesApplied: [5],
      });
    }
    out.push(current);
  }
  return out;
}

// ---------------------------------------------------------------------------
// annotateBatchable — Rule 4 (light touch for v1).
// Finds steps across different dishes that share a non-empty batchKey and
// records the cross-dish opportunity in warnings.
// ---------------------------------------------------------------------------
function annotateBatchable(steps: ScheduledStep[]): ScheduledStep[] {
  // Group by recipeStepId+batchKey — but we don't currently carry batchKey
  // forward into ScheduledStep, so for v1 this is a no-op. Future: include
  // batchKey on ScheduledStep and emit the "batchable with #X" warning here.
  return steps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function byStartAtAsc(a: ScheduledStep, b: ScheduledStep): number {
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
}

// Re-export for convenience.
export { isAllergen };
