import { describe, it, expect } from 'vitest';
import {
  parseLlmResponse,
  assertCoversEvent,
  LlmValidationError,
  type LlmStep,
} from './responseSchema';

function validStep(overrides: Partial<LlmStep> = {}): LlmStep {
  return {
    stepId: 'd_ribeye:rs5',
    dishId: 'd_ribeye',
    recipeStepId: 'rs5',
    text: 'Rest steaks 5 minutes before slicing against the grain.',
    startAt: '2026-05-14T17:55:00.000Z',
    endAt: '2026-05-14T18:00:00.000Z',
    durationSec: 300,
    phase: 'serve',
    rulesApplied: [1],
    warnings: [],
    ...overrides,
  };
}

describe('parseLlmResponse — happy path', () => {
  it('returns the shape verbatim when valid', () => {
    const raw = { steps: [validStep()] };
    const out = parseLlmResponse(raw);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].text).toMatch(/Rest steaks/);
  });
});

describe('parseLlmResponse — shape errors', () => {
  it('rejects non-object response', () => {
    expect(() => parseLlmResponse('hello')).toThrow(LlmValidationError);
    expect(() => parseLlmResponse(null)).toThrow(LlmValidationError);
  });
  it('rejects missing steps array', () => {
    expect(() => parseLlmResponse({})).toThrow(/Missing "steps"/);
  });
  it('rejects a step missing required fields', () => {
    expect(() => parseLlmResponse({ steps: [{ stepId: 'x' }] })).toThrow(LlmValidationError);
  });
  it('rejects an invalid phase', () => {
    const bad = validStep({ phase: 'garnish' as never });
    expect(() => parseLlmResponse({ steps: [bad] })).toThrow(/phase/);
  });
  it('rejects rulesApplied with non-numbers', () => {
    const bad = { ...validStep(), rulesApplied: ['rule 1'] as unknown as number[] };
    expect(() => parseLlmResponse({ steps: [bad] })).toThrow(/non-number/);
  });
});

describe('parseLlmResponse — time arithmetic invariant', () => {
  it('accepts startAt + durationSec*1000 === endAt', () => {
    expect(() => parseLlmResponse({ steps: [validStep()] })).not.toThrow();
  });
  it('rejects when startAt + duration does NOT match endAt (beyond 1s tolerance)', () => {
    const bad = validStep({ durationSec: 60 }); // startAt+60s != 5 min later
    expect(() => parseLlmResponse({ steps: [bad] })).toThrow(/Time arithmetic mismatch/);
  });
  it('accepts within 1s tolerance (rounding slop)', () => {
    const ok = validStep({
      startAt: '2026-05-14T17:55:00.500Z',
      durationSec: 300,
      endAt: '2026-05-14T18:00:00.000Z',
    });
    expect(() => parseLlmResponse({ steps: [ok] })).not.toThrow();
  });
});

describe('assertCoversEvent', () => {
  it('passes when every requested dish has a step and the last step ends at serveAt', () => {
    const steps = [validStep()];
    expect(() => assertCoversEvent({
      steps,
      dishIdsRequiringCoverage: new Set(['d_ribeye']),
      serveAt: '2026-05-14T18:00:00.000Z',
    })).not.toThrow();
  });
  it('throws when a requested dish has no step', () => {
    const steps = [validStep()];
    expect(() => assertCoversEvent({
      steps,
      dishIdsRequiringCoverage: new Set(['d_ribeye', 'd_missing']),
      serveAt: '2026-05-14T18:00:00.000Z',
    })).toThrow(/No step for dish d_missing/);
  });
  it('throws when the last step\'s endAt does not match serveAt', () => {
    const steps = [validStep({ endAt: '2026-05-14T17:50:00.000Z', startAt: '2026-05-14T17:45:00.000Z' })];
    expect(() => assertCoversEvent({
      steps,
      dishIdsRequiringCoverage: new Set(['d_ribeye']),
      serveAt: '2026-05-14T18:00:00.000Z',
    })).toThrow(/Last step's endAt does not match/);
  });
});
