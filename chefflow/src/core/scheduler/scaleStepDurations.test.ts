import { describe, it, expect } from 'vitest';
import { scaleStepDurations } from './scaleStepDurations';
import type { WorkflowStep } from '../types';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 's',
    text: 'do thing',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: 'prep',
    durationSec: 120,
    ...overrides,
  };
}

describe('scaleStepDurations', () => {
  it('returns the same array reference when ratio <= 1 (no scaling needed)', () => {
    const steps = [step({ id: 'a' }), step({ id: 'b', kind: 'passive' })];
    expect(scaleStepDurations(steps, 1)).toBe(steps);
    expect(scaleStepDurations(steps, 0.5)).toBe(steps);
  });

  it('multiplies active step durations by the portion ratio', () => {
    const out = scaleStepDurations([step({ id: 'sear', kind: 'active', durationSec: 240 })], 10);
    expect(out[0].durationSec).toBe(2400);
  });

  it('leaves passive step durations unchanged (rests, simmers)', () => {
    const out = scaleStepDurations([step({ id: 'rest', kind: 'passive', durationSec: 300 })], 10);
    expect(out[0].durationSec).toBe(300);
  });

  it('uses pan-capacity batching when set (ceil portions/cap)', () => {
    // Authored for 2 portions, cap=2. Scaling to 10 portions = 5 batches.
    // Single-batch time is 240s → 5 × 240 = 1200s.
    const out = scaleStepDurations([step({ id: 'pan', kind: 'active', durationSec: 240, panCapacityPortions: 2 })], 5);
    expect(out[0].durationSec).toBe(1200);
  });

  it('rounds pan-capacity batches up (uneven portion counts)', () => {
    // 7 portions / 2-pan cap = 3.5 → 4 batches. Single-batch = 100s.
    const out = scaleStepDurations([step({ id: 'pan', kind: 'active', durationSec: 100, panCapacityPortions: 2 })], 3.5);
    expect(out[0].durationSec).toBe(400);
  });

  it('passes sub-recipe steps through unchanged (sourceRecipeId is set)', () => {
    const sub = step({ id: 'sauce::sc1', sourceRecipeId: 'r_sauce', durationSec: 120 });
    const out = scaleStepDurations([sub], 10);
    expect(out[0]).toBe(sub);
  });

  it('skips steps without an authored duration', () => {
    const noDur = step({ id: 'noop', durationSec: undefined });
    const out = scaleStepDurations([noDur], 10);
    expect(out[0]).toBe(noDur);
  });
});
