import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Workflow, { scheduledStepsToMilestones } from './Workflow';
import { db } from '../../db/dexie';
import { scheduleEvent } from '../../core/scheduler/scheduleEvent';
import { DEMO_EVENT, RIBEYE_RECIPE, SALAD_RECIPE } from '../../core/scheduler/__fixtures__/demoEvent';

beforeEach(async () => {
  await db.events.clear();
  await db.recipes.clear();
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
      expect(screen.getByDisplayValue(/Rest steaks 5 minutes/)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/Toss leaves, tomatoes, and cucumber/)).toBeInTheDocument();
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
});
