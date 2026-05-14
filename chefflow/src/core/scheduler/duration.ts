import type { WorkflowStep, StepKind, StepPhase } from '../types';

export interface DurationOptions {
  defaultPrepDurationSec?: number;
  defaultCookDurationSec?: number;
  defaultServeDurationSec?: number;
  defaultPassiveMultiplier?: number;  // passive steps default to longer (e.g. simmering, resting)
}

const DEFAULTS: Required<DurationOptions> = {
  defaultPrepDurationSec: 180,    // 3 min — typical chop/whisk
  defaultCookDurationSec: 300,    // 5 min — typical active cooking step
  defaultServeDurationSec: 60,    // 1 min — plate/garnish
  defaultPassiveMultiplier: 2,    // passive steps (braising, resting) default ~2x active
};

/**
 * Estimate how long a WorkflowStep takes, in seconds.
 *
 * If the recipe author specified `durationSec`, use that directly. Otherwise
 * fall back to a heuristic driven by phase × kind. The fallback is intentionally
 * conservative — better to over-allocate than have the chef caught short — and
 * the function emits no warning here; the caller (scheduleEvent) records that
 * the duration was estimated when stitching ScheduledSteps together.
 */
export function estimateDuration(step: WorkflowStep, opts?: DurationOptions): number {
  if (typeof step.durationSec === 'number' && step.durationSec > 0) {
    return step.durationSec;
  }
  return fallbackDuration(step.phase, step.kind, opts);
}

export function fallbackDuration(
  phase: StepPhase,
  kind: StepKind,
  opts?: DurationOptions,
): number {
  const merged = { ...DEFAULTS, ...opts };
  const base =
    phase === 'prep' ? merged.defaultPrepDurationSec :
    phase === 'cook' ? merged.defaultCookDurationSec :
    merged.defaultServeDurationSec;
  return kind === 'passive' ? base * merged.defaultPassiveMultiplier : base;
}

/** True when the step's duration came from the recipe (vs the fallback). */
export function durationWasGiven(step: WorkflowStep): boolean {
  return typeof step.durationSec === 'number' && step.durationSec > 0;
}
