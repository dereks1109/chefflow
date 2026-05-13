import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeView from './RecipeView';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
});

const seed: Recipe = {
  id: 'r_view_seed',
  title: 'Sample Stew',
  originalYield: 4,
  prepTime: '20m',
  cookTime: '1h',
  ingredients: [
    {
      id: 'i1', raw: '{800|g|Beef Chuck}', amount: 800, unit: 'g',
      name: 'Beef Chuck', isLocked: false,
    },
  ],
  steps: [
    {
      id: 's1', text: 'Sear the beef.', kind: 'active',
      thermalClass: 'normal', allergenClass: 'allergen-free',
      dependsOn: [], phase: 'cook',
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

function renderViewAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${id}`]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeView />} />
        <Route path="/recipes" element={<div>Library</div>} />
        <Route path="/recipes/:id/edit" element={<div>Editor</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RecipeView', () => {
  it('renders the recipe title, ingredients, and steps', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sample Stew' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Beef Chuck/)).toBeInTheDocument();
    expect(screen.getByText(/Sear the beef/)).toBeInTheDocument();
  });

  it('shows not-found message for unknown id', async () => {
    renderViewAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument();
    });
  });
});
