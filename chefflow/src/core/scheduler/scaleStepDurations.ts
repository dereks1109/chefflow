import type { WorkflowStep } from '../types';

// ---------------------------------------------------------------------------
// scaleStepDurations — stretch recipe step durations so the scheduler treats
// a dish for 20 portions as taking longer to prep + cook than the same
// dish for 2 portions.
//
// Scaling model (simple but defensible):
//   - ratio = dish.portions / recipe.originalYield, clamped to >= 1
//     (we never SHRINK durations below the authored time — a recipe authored
//     for 4 portions used at 2 portions still wants the full original time)
//   - if step.panCapacityPortions is set:
//       batches = ceil(portions / panCapacityPortions); original times one batch
//       duration = step.durationSec × batches / originalBatches
//   - else if step.kind === 'passive': duration unchanged
//     (passive = waiting / resting / simmering; doesn't scale with portion count)
//   - else (active): duration × ratio (linear)
//   - Steps with step.sourceRecipeId (merged in from a sub-recipe) pass
//     through unscaled. Sub-recipe quantities are literal in the parent
//     ingredient line, so the sub-recipe runs once at its own batch size.
//
// We round to the nearest whole second to keep JSON snapshots stable.
// ---------------------------------------------------------------------------

export function scaleStepDurations(
  steps: WorkflowStep[],
  ratio: number,
): WorkflowStep[] {
  const safeRatio = Number.isFinite(ratio) && ratio > 1 ? ratio : 1;
  if (safeRatio === 1) return steps;
  return steps.map((s) => scaleOne(s, safeRatio));
}

function scaleOne(step: WorkflowStep, ratio: number): WorkflowStep {
  if (step.sourceRecipeId) return step;
  if (step.durationSec == null) return step;

  const cap = step.panCapacityPortions;
  if (cap && cap > 0) {
    // Batch model: portions / cap = number of batches. The recipe's original
    // step time assumed a single batch (cap portions). Multiply by the
    // ceiling of portions/cap → number of batches needed.
    const batches = Math.max(1, Math.ceil(ratio));
    return { ...step, durationSec: Math.round(step.durationSec * batches) };
  }
  if (step.kind === 'passive') return step;
  return { ...step, durationSec: Math.round(step.durationSec * ratio) };
}
