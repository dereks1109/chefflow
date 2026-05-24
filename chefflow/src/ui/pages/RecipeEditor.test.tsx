import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeEditor from './RecipeEditor';
import { db } from '../../db/dexie';
import { setCurrentUserId } from '../../state/currentUser';
import type { Recipe } from '../../core/types';

const TEST_USER = 'user_page_test';

beforeEach(async () => {
  await db.recipes.clear();
  setCurrentUserId(TEST_USER);
  // Save / remove buttons confirm via window.confirm — auto-accept in tests.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
  ownerId: TEST_USER,
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
    // seed.prepTime = '20m' → 0h, 20m
    expect(screen.getByLabelText('Prep time hours')).toHaveValue('0');
    expect(screen.getByLabelText('Prep time minutes')).toHaveValue('20');
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
