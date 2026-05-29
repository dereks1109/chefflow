import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Workflow, { scheduledStepsToMilestones, milestonesToScheduledSteps } from './Workflow';
import { db } from '../../db/dexie';
import { scheduleEvent } from '../../core/scheduler/scheduleEvent';
import { hashDishes } from '../../core/scheduler/hash';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { DEMO_EVENT, RIBEYE_RECIPE, SALAD_RECIPE } from '../../core/scheduler/__fixtures__/demoEvent';
import type { ScheduledStep } from '../../core/types';

// ---------------------------------------------------------------------------
// LLM stub: all tests get a fake fetch that returns a valid workflow JSON
// matching the Demo Event's 9 recipe steps. Tests that want to assert error
// or needs-key flows override or unset.
// ---------------------------------------------------------------------------
const VALID_DEMO_REPLY = JSON.stringify({
  steps: [
    { stepId: 'd_ribeye:rs1', dishId: 'd_ribeye', recipeStepId: 'rs1', text: 'Pat steaks dry', startAt: '2026-05-14T17:45:00.000Z', endAt: '2026-05-14T17:47:00.000Z', durationSec: 120, phase: 'prep', rulesApplied: [1], warnings: [] },
    { stepId: 'd_ribeye:rs2', dishId: 'd_ribeye', recipeStepId: 'rs2', text: 'Heat skillet', startAt: '2026-05-14T17:47:00.000Z', endAt: '2026-05-14T17:49:00.000Z', durationSec: 120, phase: 'cook', rulesApplied: [1, 3], warnings: [] },
    { stepId: 'd_ribeye:rs3', dishId: 'd_ribeye', recipeStepId: 'rs3', text: 'Sear', startAt: '2026-05-14T17:49:00.000Z', endAt: '2026-05-14T17:53:00.000Z', durationSec: 240, phase: 'cook', rulesApplied: [1, 3], warnings: [] },
    { stepId: 'd_ribeye:rs4', dishId: 'd_ribeye', recipeStepId: 'rs4', text: 'Baste', startAt: '2026-05-14T17:53:00.000Z', endAt: '2026-05-14T17:54:00.000Z', durationSec: 60, phase: 'cook', rulesApplied: [1], warnings: [] },
    { stepId: 'd_ribeye:rs5', dishId: 'd_ribeye', recipeStepId: 'rs5', text: 'Rest steaks 5 minutes', startAt: '2026-05-14T17:55:00.000Z', endAt: '2026-05-14T18:00:00.000Z', durationSec: 300, phase: 'serve', rulesApplied: [1, 2], warnings: [] },
    { stepId: 'd_salad:ss1', dishId: 'd_salad', recipeStepId: 'ss1', text: 'Wash salad leaves', startAt: '2026-05-14T17:40:00.000Z', endAt: '2026-05-14T17:45:00.000Z', durationSec: 300, phase: 'prep', rulesApplied: [1, 5], warnings: [] },
    { stepId: 'd_salad:ss2', dishId: 'd_salad', recipeStepId: 'ss2', text: 'Chop', startAt: '2026-05-14T17:45:00.000Z', endAt: '2026-05-14T17:47:00.000Z', durationSec: 120, phase: 'prep', rulesApplied: [1, 5], warnings: [] },
    { stepId: 'd_salad:ss3', dishId: 'd_salad', recipeStepId: 'ss3', text: 'Whisk dressing', startAt: '2026-05-14T17:47:00.000Z', endAt: '2026-05-14T17:48:00.000Z', durationSec: 60, phase: 'prep', rulesApplied: [1, 6], warnings: [] },
    { stepId: 'd_salad:ss4', dishId: 'd_salad', recipeStepId: 'ss4', text: 'Toss leaves, tomatoes, and cucumber', startAt: '2026-05-14T17:58:00.000Z', endAt: '2026-05-14T18:00:00.000Z', durationSec: 120, phase: 'serve', rulesApplied: [1, 3], warnings: [] },
  ],
});

function stubGroqOk() {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve(new Response(
      JSON.stringify({ choices: [{ message: { content: VALID_DEMO_REPLY } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )),
  ));
}

beforeEach(async () => {
  await db.events.clear();
  await db.recipes.clear();
  // Default: ready-to-go LLM. Set an API key so the page doesn't park on needs-key.
  useLlmSettingsStore.setState({ apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile' });
  stubGroqOk();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorkflowAt(eventId: string) {
  return render(
    <MemoryRouter initialEntries={[`/workflows/${eventId}`]}>
      <Routes>
        <Route path="/workflows/:eventId" element={<Workflow />} />
        <Route path="/workflows" element={<div>Workflow library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Workflow page', () => {
  it('renders the event header (title + date)', async () => {
    await db.events.put(DEMO_EVENT);
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Demo Event' })).toBeInTheDocument();
    });
  });

  it('renders scheduled step content from the algorithm (not the old placeholder)', async () => {
    await db.events.put(DEMO_EVENT);
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    // Wait for both the event load AND the milestone render
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Demo Event' })).toBeInTheDocument();
    });

    // The algorithm should produce a "Rest steaks" step and a "Toss" step —
    // both straight from the recipe text. The old placeholder used phrases
    // like "Phase 4 — Final toss & plate" instead.
    await waitFor(() => {
      expect(screen.getByText(/Rest steaks 5 minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Toss leaves, tomatoes, and cucumber/)).toBeInTheDocument();
    });
  });

  it('shows a hint when the event has no dishes', async () => {
    await db.events.put({ ...DEMO_EVENT, dishes: [] });
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/no dishes yet/i)).toBeInTheDocument();
    });
  });

  it('not-found message for unknown event id', async () => {
    renderWorkflowAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });
});

describe('scheduledStepsToMilestones adapter', () => {
  it('groups Demo Event steps into Prep / Cook / Serve milestones in that order', () => {
    const recipes = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE], [SALAD_RECIPE.id, SALAD_RECIPE]]);
    const scheduled = scheduleEvent({ event: DEMO_EVENT, recipes });
    const milestones = scheduledStepsToMilestones(scheduled);

    expect(milestones.map((m) => m.id)).toEqual(['phase-prep', 'phase-cook', 'phase-serve']);
    // Sanitize phase missing because everything in the Demo is allergen-free
    expect(milestones.find((m) => m.id === 'phase-sanitize')).toBeUndefined();
  });

  it('populates each step\'s meta with a time, dish label, and rule list', () => {
    const recipes = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE]]);
    const scheduled = scheduleEvent({
      event: { ...DEMO_EVENT, dishes: [DEMO_EVENT.dishes[0]] },
      recipes,
    });
    const milestones = scheduledStepsToMilestones(scheduled);
    const firstStep = milestones[0].steps[0];
    expect(firstStep.meta?.time).toMatch(/^\d{2}:\d{2}$/);
    expect(firstStep.meta?.dish).toBe('(Demo) Ribeye');
    expect(firstStep.meta?.rules).toContain(1);
  });

  it('round-trips through milestonesToScheduledSteps: last step ends at serveAt, times chain', () => {
    const recipes = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE]]);
    const original = scheduleEvent({
      event: { ...DEMO_EVENT, dishes: [DEMO_EVENT.dishes[0]] },
      recipes,
    });
    const milestones = scheduledStepsToMilestones(original);
    const byId = new Map(original.map((s) => [s.id, s]));
    const serveAt = new Date(DEMO_EVENT.serveAt!);
    const rebuilt = milestonesToScheduledSteps(milestones, byId, serveAt);

    // Last step must end at serveAt and chain back contiguously.
    expect(rebuilt[rebuilt.length - 1].endAt).toBe(DEMO_EVENT.serveAt);
    for (let i = 1; i < rebuilt.length; i++) {
      expect(rebuilt[i - 1].endAt).toBe(rebuilt[i].startAt);
    }
  });

  it('populates meta.colorTag from dish.colorTag when dishes are passed', () => {
    const dishWithColor = { ...DEMO_EVENT.dishes[0], colorTag: 'green' as const };
    const event = { ...DEMO_EVENT, dishes: [dishWithColor] };
    const recipes = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE]]);
    const scheduled = scheduleEvent({ event, recipes });
    const milestones = scheduledStepsToMilestones(scheduled, event.dishes);
    // Every step in the result should carry the dish's green color tag.
    for (const milestone of milestones) {
      for (const step of milestone.steps) {
        expect(step.meta?.colorTag).toBe('green');
        expect(step.meta?.dishId).toBe(dishWithColor.id);
      }
    }
  });
});

describe('Workflow page — chef filter', () => {
  it('renders chef-filter chips, one per unique dish color', async () => {
    await db.events.put({
      ...DEMO_EVENT,
      dishes: [
        { ...DEMO_EVENT.dishes[0], colorTag: 'green' },
        { ...DEMO_EVENT.dishes[1], colorTag: 'blue' },
      ],
    });
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /All/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /Green/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Blue/ })).toBeInTheDocument();
  });

  it('shows a hint when no dish has a color assigned yet', async () => {
    await db.events.put(DEMO_EVENT);  // no colorTags on dishes
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/Assign a color/)).toBeInTheDocument();
    });
  });

  it("filtering to a color shows only that chef's steps in the unified phase-grouped view", async () => {
    await db.events.put({
      ...DEMO_EVENT,
      dishes: [
        { ...DEMO_EVENT.dishes[0], colorTag: 'green' },  // ribeye
        { ...DEMO_EVENT.dishes[1], colorTag: 'blue' },   // salad
      ],
    });
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => screen.getByRole('tab', { name: /Green/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Green/ }));

    // Filtered view renders Ribeye step text (Green) and hides Salad text (Blue).
    await waitFor(() => {
      // The interactive list AND the hidden print-checklist both contain
      // this text — `getAllByText` accepts both; presence is what matters.
      expect(screen.getAllByText(/Pat steaks dry/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Wash salad leaves/)).toBeNull();
  });
});

describe('Workflow page — local-scheduler fallback', () => {
  it('falls back to the local scheduler when the LLM call rejects', async () => {
    await db.events.put(DEMO_EVENT);
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    // Override the global fetch stub set in beforeEach with a 500 so
    // scheduleEventLLM throws — runLlm should then call scheduleEvent.
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response('Internal error', { status: 500 })),
    ));

    renderWorkflowAt(DEMO_EVENT.id);

    // Local scheduler produces step text verbatim from RIBEYE_RECIPE / SALAD_RECIPE,
    // so the same "Rest" / "Toss" probes used elsewhere prove the fallback ran.
    await waitFor(() => {
      expect(screen.getByText(/Rest steaks 5 minutes/)).toBeInTheDocument();
      expect(screen.getByText(/Toss leaves, tomatoes, and cucumber/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Fallback timeline/i)).toBeInTheDocument();
  });

});

describe('Workflow page — persistence', () => {
  it('uses event.workflow when present (skipping the algorithm)', async () => {
    // Plant a saved snapshot with custom step text that wouldn't come from the algorithm.
    const customStep: ScheduledStep = {
      id: 'custom:1',
      dishId: 'd_ribeye',
      recipeId: RIBEYE_RECIPE.id,
      recipeStepId: 'rs1',
      dishLabel: '(Demo) Ribeye',
      text: 'CUSTOM SAVED STEP — should appear on load',
      startAt: '2026-05-14T17:55:00.000Z',
      endAt: '2026-05-14T18:00:00.000Z',
      durationSec: 300,
      phase: 'serve',
      kind: 'active',
      thermalClass: 'normal',
      allergenClass: 'allergen-free',
      dependsOnStepIds: [],
      warnings: [],
      rulesApplied: [1],
    };
    const eventWithSnapshot = {
      ...DEMO_EVENT,
      workflow: [customStep],
      workflowDishesHash: hashDishes(DEMO_EVENT.dishes),
    };
    await db.events.put(eventWithSnapshot);
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/CUSTOM SAVED STEP/)).toBeInTheDocument();
    });
  });

  it('shows a stale banner when the saved hash no longer matches the current dishes', async () => {
    await db.events.put({
      ...DEMO_EVENT,
      workflow: [
        {
          id: 'fake:1',
          dishId: 'd_ribeye',
          recipeId: RIBEYE_RECIPE.id,
          recipeStepId: 'rs1',
          dishLabel: '(Demo) Ribeye',
          text: 'Stale snapshot step',
          startAt: '2026-05-14T17:55:00.000Z',
          endAt: '2026-05-14T18:00:00.000Z',
          durationSec: 300,
          phase: 'prep',
          kind: 'active',
          thermalClass: 'normal',
          allergenClass: 'allergen-free',
          dependsOnStepIds: [],
          warnings: [],
          rulesApplied: [1],
        },
      ],
      workflowDishesHash: 'not-matching',
    });
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/dishes have changed/i)).toBeInTheDocument();
    });
  });

  it('after a fresh LLM generation, Save button reads "Save changes" + Unsaved pill is visible (chef notices the unsaved snapshot)', async () => {
    // Event has dishes but NO saved workflow — runSchedule will fire and
    // produce a fresh, unsaved snapshot. needsSave should flip true.
    await db.events.put(DEMO_EVENT);
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    // Wait for the schedule to render (proves workflowStatus → 'ready'
    // and scheduled.length > 0, the preconditions for needsSave).
    await waitFor(() => {
      expect(screen.getByText(/Rest steaks 5 minutes/)).toBeInTheDocument();
    });

    // Loud-state assertions: orange "Save changes" + amber "Unsaved" pill.
    // If a future change accidentally re-quiets the button (e.g. by removing
    // !loadedFromSnapshot from needsSave), THIS is the test that fails.
    const saveBtn = screen.getByTestId('workflow-save-button');
    expect(saveBtn).toHaveTextContent(/save changes/i);
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.className).toContain('btn-primary');
    expect(screen.getByTestId('workflow-unsaved-pill')).toBeInTheDocument();
  });

  it('when a saved snapshot loads cleanly, Save button reads "Saved" + no pill (no false alarm)', async () => {
    // Plant a snapshot whose hash matches current dishes — loadedFromSnapshot
    // becomes true, dirty stays false, so needsSave should be false.
    const saved: ScheduledStep = {
      id: 'saved:1',
      dishId: 'd_ribeye',
      recipeId: RIBEYE_RECIPE.id,
      recipeStepId: 'rs1',
      dishLabel: '(Demo) Ribeye',
      text: 'Previously saved step',
      startAt: '2026-05-14T17:55:00.000Z',
      endAt: '2026-05-14T18:00:00.000Z',
      durationSec: 300,
      phase: 'serve',
      kind: 'active',
      thermalClass: 'normal',
      allergenClass: 'allergen-free',
      dependsOnStepIds: [],
      warnings: [],
      rulesApplied: [1],
    };
    await db.events.put({
      ...DEMO_EVENT,
      workflow: [saved],
      workflowDishesHash: hashDishes(DEMO_EVENT.dishes),
    });
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/Previously saved step/)).toBeInTheDocument();
    });

    const saveBtn = screen.getByTestId('workflow-save-button');
    expect(saveBtn).toHaveTextContent(/saved/i);
    expect(saveBtn).toBeDisabled();
    expect(screen.queryByTestId('workflow-unsaved-pill')).toBeNull();
  });

  it('Regenerate clears the saved snapshot and re-runs the algorithm', async () => {
    await db.events.put({
      ...DEMO_EVENT,
      workflow: [
        {
          id: 'fake:1',
          dishId: 'd_ribeye',
          recipeId: RIBEYE_RECIPE.id,
          recipeStepId: 'rs1',
          dishLabel: '(Demo) Ribeye',
          text: 'OLD SAVED STEP',
          startAt: '2026-05-14T17:55:00.000Z',
          endAt: '2026-05-14T18:00:00.000Z',
          durationSec: 300,
          phase: 'prep',
          kind: 'active',
          thermalClass: 'normal',
          allergenClass: 'allergen-free',
          dependsOnStepIds: [],
          warnings: [],
          rulesApplied: [1],
        },
      ],
      workflowDishesHash: hashDishes(DEMO_EVENT.dishes),
    });
    await db.recipes.bulkPut([RIBEYE_RECIPE, SALAD_RECIPE]);
    renderWorkflowAt(DEMO_EVENT.id);

    await waitFor(() => {
      expect(screen.getByText(/OLD SAVED STEP/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    // Saved snapshot should be cleared in Dexie.
    await waitFor(async () => {
      const updated = await db.events.get(DEMO_EVENT.id);
      expect(updated?.workflow).toBeUndefined();
      expect(updated?.workflowDishesHash).toBeUndefined();
    });
    // After regeneration, the algorithm output should mount (real recipe text).
    await waitFor(
      () => {
        // The interactive list AND the hidden print-checklist both contain
      // this text — `getAllByText` accepts both; presence is what matters.
      expect(screen.getAllByText(/Pat steaks dry/).length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });
});
