import { describe, it, expect, vi } from 'vitest';
import { scheduleEventLLM, LlmValidationError, GroqClientError } from './llmScheduler';
import { DEMO_EVENT, DEMO_RECIPES, RIBEYE_RECIPE, SALAD_RECIPE } from '../__fixtures__/demoEvent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockFetchReturning(payload: unknown, status = 200): typeof fetch {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return vi.fn(() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch;
}

function llmReplyWith(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

// A valid response covering every Demo Event recipe step, ending at 18:00.
const VALID_DEMO_REPLY = JSON.stringify({
  steps: [
    // Ribeye — 5 steps, last ends at 18:00 with 5-min rest
    { stepId: 'd_ribeye:rs1', dishId: 'd_ribeye', recipeStepId: 'rs1', text: 'Pat steaks dry', startAt: '2026-05-14T17:45:00.000Z', endAt: '2026-05-14T17:47:00.000Z', durationSec: 120, phase: 'prep', rulesApplied: [1], warnings: [] },
    { stepId: 'd_ribeye:rs2', dishId: 'd_ribeye', recipeStepId: 'rs2', text: 'Heat skillet', startAt: '2026-05-14T17:47:00.000Z', endAt: '2026-05-14T17:49:00.000Z', durationSec: 120, phase: 'cook', rulesApplied: [1, 3], warnings: [] },
    { stepId: 'd_ribeye:rs3', dishId: 'd_ribeye', recipeStepId: 'rs3', text: 'Sear', startAt: '2026-05-14T17:49:00.000Z', endAt: '2026-05-14T17:53:00.000Z', durationSec: 240, phase: 'cook', rulesApplied: [1, 3], warnings: [] },
    { stepId: 'd_ribeye:rs4', dishId: 'd_ribeye', recipeStepId: 'rs4', text: 'Baste', startAt: '2026-05-14T17:53:00.000Z', endAt: '2026-05-14T17:54:00.000Z', durationSec: 60, phase: 'cook', rulesApplied: [1], warnings: [] },
    { stepId: 'd_ribeye:rs5', dishId: 'd_ribeye', recipeStepId: 'rs5', text: 'Rest', startAt: '2026-05-14T17:55:00.000Z', endAt: '2026-05-14T18:00:00.000Z', durationSec: 300, phase: 'serve', rulesApplied: [1, 2], warnings: [] },
    // Salad — 4 steps
    { stepId: 'd_salad:ss1', dishId: 'd_salad', recipeStepId: 'ss1', text: 'Wash', startAt: '2026-05-14T17:40:00.000Z', endAt: '2026-05-14T17:45:00.000Z', durationSec: 300, phase: 'prep', rulesApplied: [1, 5], warnings: [] },
    { stepId: 'd_salad:ss2', dishId: 'd_salad', recipeStepId: 'ss2', text: 'Chop', startAt: '2026-05-14T17:45:00.000Z', endAt: '2026-05-14T17:47:00.000Z', durationSec: 120, phase: 'prep', rulesApplied: [1, 5], warnings: [] },
    { stepId: 'd_salad:ss3', dishId: 'd_salad', recipeStepId: 'ss3', text: 'Dressing', startAt: '2026-05-14T17:47:00.000Z', endAt: '2026-05-14T17:48:00.000Z', durationSec: 60, phase: 'prep', rulesApplied: [1, 6], warnings: [] },
    { stepId: 'd_salad:ss4', dishId: 'd_salad', recipeStepId: 'ss4', text: 'Toss', startAt: '2026-05-14T17:58:00.000Z', endAt: '2026-05-14T18:00:00.000Z', durationSec: 120, phase: 'serve', rulesApplied: [1, 3], warnings: [] },
  ],
});

describe('scheduleEventLLM — happy path', () => {
  it('returns ScheduledStep[] with all 9 Demo Event steps + LLM metadata joined to recipe metadata', async () => {
    const fetchImpl = mockFetchReturning(llmReplyWith(VALID_DEMO_REPLY));
    const { steps, modelUsed } = await scheduleEventLLM({
      event: DEMO_EVENT,
      recipes: DEMO_RECIPES,
      apiKey: 'gsk_test',
      model: 'llama-3.3-70b-versatile',
      fetchImpl,
    });

    expect(steps).toHaveLength(RIBEYE_RECIPE.steps.length + SALAD_RECIPE.steps.length);
    expect(modelUsed).toBe('llama-3.3-70b-versatile');

    // Every step should have id === `${dishId}:${recipeStepId}` and the
    // kind/thermal/allergen joined from the recipe (not the LLM).
    const rest = steps.find((s) => s.id === 'd_ribeye:rs5')!;
    expect(rest.kind).toBe('passive');        // from the recipe fixture
    expect(rest.thermalClass).toBe('normal'); // from the recipe fixture
    expect(rest.rulesApplied).toEqual([1, 2]); // from the LLM

    const toss = steps.find((s) => s.id === 'd_salad:ss4')!;
    expect(toss.thermalClass).toBe('flash');  // salad ss4 was marked flash in fixture
    expect(toss.endAt).toBe('2026-05-14T18:00:00.000Z');
  });

  // Groq's JSON-mode is reliable but occasionally regresses to fenced output.
  // The scheduler should still parse cleanly — the fence-strip util at
  // src/core/llm/stripMarkdownFences.ts unwraps it before JSON.parse.
  it('parses ```json … ```-wrapped responses (regression: Groq fenced output)', async () => {
    const fenced = '```json\n' + VALID_DEMO_REPLY + '\n```';
    const fetchImpl = mockFetchReturning(llmReplyWith(fenced));
    const { steps } = await scheduleEventLLM({
      event: DEMO_EVENT,
      recipes: DEMO_RECIPES,
      apiKey: 'gsk_test',
      model: 'llama-3.3-70b-versatile',
      fetchImpl,
    });
    expect(steps).toHaveLength(RIBEYE_RECIPE.steps.length + SALAD_RECIPE.steps.length);
  });
});

describe('scheduleEventLLM — error surfaces', () => {
  it('throws GroqClientError when no API key', async () => {
    await expect(
      scheduleEventLLM({
        event: DEMO_EVENT,
        recipes: DEMO_RECIPES,
        apiKey: '',
        model: 'llama-3.3-70b-versatile',
        fetchImpl: mockFetchReturning(llmReplyWith(VALID_DEMO_REPLY)),
      }),
    ).rejects.toThrow(GroqClientError);
  });

  it('throws LlmValidationError when the LLM returns invalid JSON', async () => {
    const fetchImpl = mockFetchReturning(llmReplyWith('this is not json'));
    await expect(
      scheduleEventLLM({
        event: DEMO_EVENT,
        recipes: DEMO_RECIPES,
        apiKey: 'gsk_test',
        model: 'llama-3.3-70b-versatile',
        fetchImpl,
      }),
    ).rejects.toThrow(LlmValidationError);
  });

  it('throws LlmValidationError when the LLM drops a dish (coverage check)', async () => {
    // Reply only contains ribeye steps — salad dish is missing.
    const partial = JSON.stringify({
      steps: JSON.parse(VALID_DEMO_REPLY).steps.filter(
        (s: { dishId: string }) => s.dishId === 'd_ribeye',
      ),
    });
    const fetchImpl = mockFetchReturning(llmReplyWith(partial));
    await expect(
      scheduleEventLLM({
        event: DEMO_EVENT,
        recipes: DEMO_RECIPES,
        apiKey: 'gsk_test',
        model: 'llama-3.3-70b-versatile',
        fetchImpl,
      }),
    ).rejects.toThrow(/No step for dish d_salad/);
  });

  it('throws when the last step does NOT end at event.serveAt', async () => {
    const offByThirtySec = JSON.stringify({
      steps: JSON.parse(VALID_DEMO_REPLY).steps.map((s: { stepId: string; endAt: string }) =>
        s.stepId === 'd_ribeye:rs5' ? { ...s, endAt: '2026-05-14T18:00:30.000Z' } : s,
      ),
    });
    const fetchImpl = mockFetchReturning(llmReplyWith(offByThirtySec));
    await expect(
      scheduleEventLLM({
        event: DEMO_EVENT,
        recipes: DEMO_RECIPES,
        apiKey: 'gsk_test',
        model: 'llama-3.3-70b-versatile',
        fetchImpl,
      }),
    ).rejects.toThrow();
  });
});

describe('scheduleEventLLM — prepared dishes', () => {
  it('does not require coverage for prepared dishes (LLM still emits a placeholder)', async () => {
    const eventWithPrepared = {
      ...DEMO_EVENT,
      dishes: [
        ...DEMO_EVENT.dishes,
        { id: 'd_bakery', name: 'Bakery rolls', isPrepared: true, portions: 4, startAt: '2026-05-14T17:55:00.000Z' },
      ],
    };
    // LLM reply unchanged (no step for d_bakery) — should NOT throw, because
    // d_bakery is prepared (no recipe to cover).
    const fetchImpl = mockFetchReturning(llmReplyWith(VALID_DEMO_REPLY));
    const { steps } = await scheduleEventLLM({
      event: eventWithPrepared,
      recipes: DEMO_RECIPES,
      apiKey: 'gsk_test',
      model: 'llama-3.3-70b-versatile',
      fetchImpl,
    });
    expect(steps).toHaveLength(9); // ribeye + salad recipe steps; no extra
  });
});
