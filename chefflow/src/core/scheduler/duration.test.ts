import { describe, it, expect } from 'vitest';
import { estimateDuration, fallbackDuration, durationWasGiven } from './duration';
import type { WorkflowStep } from '../types';

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 's',
    text: '',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: 'cook',
    ...overrides,
  };
}

describe('estimateDuration', () => {
  it('uses recipe-author durationSec when present', () => {
    expect(estimateDuration(step({ durationSec: 90 }))).toBe(90);
  });

  it('ignores durationSec when zero or negative (treats as missing)', () => {
    expect(estimateDuration(step({ durationSec: 0 }))).toBe(300);
    expect(estimateDuration(step({ durationSec: -1 }))).toBe(300);
  });

  it('falls back to a phase-driven default when durationSec is undefined', () => {
    expect(estimateDuration(step({ phase: 'prep' }))).toBe(180);
    expect(estimateDuration(step({ phase: 'cook' }))).toBe(300);
    expect(estimateDuration(step({ phase: 'serve' }))).toBe(60);
  });

  it('doubles the fallback when the step is passive (resting, simmering, etc.)', () => {
    expect(estimateDuration(step({ phase: 'cook', kind: 'passive' }))).toBe(600);
    expect(estimateDuration(step({ phase: 'serve', kind: 'passive' }))).toBe(120);
  });

  it('respects caller-supplied option overrides', () => {
    expect(
      estimateDuration(step({ phase: 'cook' }), { defaultCookDurationSec: 60 }),
    ).toBe(60);
  });
});

describe('fallbackDuration', () => {
  it('matches the table for active steps', () => {
    expect(fallbackDuration('prep', 'active')).toBe(180);
    expect(fallbackDuration('cook', 'active')).toBe(300);
    expect(fallbackDuration('serve', 'active')).toBe(60);
  });
});

describe('durationWasGiven', () => {
  it('true only when the recipe author wrote a positive durationSec', () => {
    expect(durationWasGiven(step({ durationSec: 120 }))).toBe(true);
    expect(durationWasGiven(step())).toBe(false);
    expect(durationWasGiven(step({ durationSec: 0 }))).toBe(false);
  });
});
