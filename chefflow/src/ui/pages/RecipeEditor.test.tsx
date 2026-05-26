import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeEditor from './RecipeEditor';
import { db } from '../../db/dexie';
import { usePublishedSet } from '../../state/usePublishedSet';
import { useSessionAttestationStore } from '../../state/useSessionAttestationStore';
import type { Recipe } from '../../core/types';

// Hoisted spy so we can assert auto-republish was (or wasn't) invoked
// without needing to hit the real worker fetch path.
const publishRecipeMock = vi.hoisted(() => vi.fn(async (_r: unknown, _name: string) => ({ id: 'cr_mock' })));
const unpublishRecipeMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../core/community/communityClient', () => ({
  publishRecipe: publishRecipeMock,
  unpublishRecipe: unpublishRecipeMock,
}));

beforeEach(async () => {
  await db.recipes.clear();
  usePublishedSet.setState({ map: {} });
  publishRecipeMock.mockClear();
  unpublishRecipeMock.mockClear();
  // Save / remove buttons confirm via window.confirm — auto-accept in tests.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  // T4b (2026-05-27) introduces a session-scoped save-time attestation
  // gate. Pre-set the flag in tests that don't specifically exercise it
  // so existing test assertions about save behaviour still hold without
  // having to dismiss the modal in every test.
  useSessionAttestationStore.setState({ recipeSaveAttested: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const seed: Recipe = {
  id: 'r_test_seed',
  title: 'Seed Recipe',
  originalYield: 4,
  prepTime: '20m',
  cookTime: '1h',
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

function renderEditorAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${id}/edit`]}>
      <Routes>
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/recipes" element={<div>Library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RecipeEditor — header + ingredients', () => {
  it('loads an existing recipe and shows its title + prep time', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Seed Recipe')).toBeInTheDocument();
    });
    // seed.prepTime = '20m' → 0h, 20m. The TimePicker now uses
    // <input type="number"> so toHaveValue returns a number, not a string.
    expect(screen.getByLabelText('Prep time hours')).toHaveValue(0);
    expect(screen.getByLabelText('Prep time minutes')).toHaveValue(20);
  });

  it('edits the title and saves', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    const titleInput = await screen.findByDisplayValue('Seed Recipe');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.title).toBe('Renamed');
    });
  });

  it('adds and removes an ingredient', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');

    await userEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getAllByLabelText('Ingredient name')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /remove ingredient/i }));
    expect(screen.queryByLabelText('Ingredient name')).toBeNull();
  });

  it('shows not-found message for unknown recipe id', async () => {
    renderEditorAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument();
    });
  });
});

describe('RecipeEditor — steps', () => {
  it('adds a step and persists it on save', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');

    await userEvent.click(screen.getByRole('button', { name: /add step/i }));
    const stepTextarea = screen.getByLabelText(/step 1 text/i);
    await userEvent.type(stepTextarea, 'Sear the beef');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.steps).toHaveLength(1);
      expect(updated?.steps[0].text).toBe('Sear the beef');
    });
  });

  it('removes a step', async () => {
    await db.recipes.put({ ...seed, steps: [{
      id: 's1', text: 'Existing', kind: 'active',
      thermalClass: 'normal', allergenClass: 'allergen-free',
      dependsOn: [], phase: 'cook'
    }] });
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Existing');

    await userEvent.click(screen.getByRole('button', { name: /remove step 1/i }));
    expect(screen.queryByDisplayValue('Existing')).toBeNull();
  });
});

describe('RecipeEditor — auto-republish on save', () => {
  it('does NOT call publishRecipe when the recipe is not in the published set', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');
    // Edit + save without ever publishing.
    const title = screen.getByDisplayValue('Seed Recipe');
    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.title).toBe('Renamed');
    });
    expect(publishRecipeMock).not.toHaveBeenCalled();
  });

  it('auto-republishes when the recipe IS in the published set — community card stays in sync with local edits', async () => {
    await db.recipes.put(seed);
    // Mark this recipe as currently published in community.
    usePublishedSet.setState({ map: { [seed.id]: 'cr_existing' } });

    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');

    const title = screen.getByDisplayValue('Seed Recipe');
    await userEvent.clear(title);
    await userEvent.type(title, 'Renamed V2');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(publishRecipeMock).toHaveBeenCalledTimes(1);
    });
    const [recipePayload] = publishRecipeMock.mock.calls[0] as [Recipe, string];
    expect(recipePayload.title).toBe('Renamed V2');
  });

  it('survives a publishRecipe failure — local save still succeeds, no error surfaces to UI', async () => {
    publishRecipeMock.mockRejectedValueOnce(new Error('worker down'));
    await db.recipes.put(seed);
    usePublishedSet.setState({ map: { [seed.id]: 'cr_existing' } });

    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');
    const title = screen.getByDisplayValue('Seed Recipe');
    await userEvent.clear(title);
    await userEvent.type(title, 'Title After Worker Outage');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // The save should succeed locally.
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.title).toBe('Title After Worker Outage');
    });
    // No alert / error region surfaces.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
