import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeView from './RecipeView';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const seed: Recipe = {
  id: 'r_view_seed',
  title: 'Roast Lamb',
  originalYield: 6,
  prepTime: '30m',
  cookTime: '2h',
  description: 'A slow-roasted lamb shoulder.',
  ingredients: [
    { id: 'i1', raw: '', amount: 1, unit: 'kg', name: 'lamb shoulder', isLocked: false },
    { id: 'i2', raw: '', amount: 4, unit: 'unit', name: 'garlic cloves', isLocked: false, allergenFlags: [] },
  ],
  steps: [
    { id: 's1', text: 'Season the lamb', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'prep' },
    { id: 's2', text: 'Slow roast for 2 hours', kind: 'passive', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'cook' },
  ],
  createdAt: 1,
  updatedAt: 1,
  allergens: ['gluten'],
  otherTags: ['italian', 'weekend'],
};

function renderViewAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${id}`]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeView />} />
        <Route path="/recipes/:id/edit" element={<div data-testid="editor-stub">Editor</div>} />
        <Route path="/recipes" element={<div>Library</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RecipeView', () => {
  it('renders the title, yield, description, ingredients, and steps in read mode', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => screen.getByTestId('recipe-view-title'));
    expect(screen.getByTestId('recipe-view-title').textContent).toBe('Roast Lamb');
    expect(screen.getByTestId('recipe-view-ingredients').textContent).toContain('lamb shoulder');
    expect(screen.getByTestId('recipe-view-steps').textContent).toContain('Slow roast for 2 hours');
    expect(screen.getByText(/Yields 6 portions/)).toBeTruthy();
    expect(screen.getByText('A slow-roasted lamb shoulder.')).toBeTruthy();
  });

  it('renders allergen + other-tag pills', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => screen.getByTestId('recipe-view-title'));
    expect(screen.getByText('italian')).toBeTruthy();
    expect(screen.getByText('weekend')).toBeTruthy();
  });

  it('clicking the Edit button navigates to /recipes/:id/edit', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => screen.getByTestId('recipe-view-edit'));
    await userEvent.click(screen.getByTestId('recipe-view-edit'));
    expect(screen.getByTestId('editor-stub')).toBeTruthy();
  });

  it('shows a "not found" message + Back-to-library when the recipe id is unknown', async () => {
    renderViewAt('r_does_not_exist');
    await waitFor(() => screen.getByText('Recipe not found.'));
    expect(screen.getByRole('button', { name: /back to library/i })).toBeTruthy();
  });
});
