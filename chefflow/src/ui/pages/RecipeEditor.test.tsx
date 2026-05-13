import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeEditor from './RecipeEditor';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
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
  it('loads an existing recipe and shows its title', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Seed Recipe')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('20m')).toBeInTheDocument();
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
