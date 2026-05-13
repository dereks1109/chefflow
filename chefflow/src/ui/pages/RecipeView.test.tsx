import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeView from './RecipeView';
import { db } from '../../db/dexie';
import { useUnitSystemStore } from '../../state/unitSystemStore';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
  // Pin the unit system to 'auto' so the scaler doesn't perform metric/imperial
  // conversions that would muddy the numeric assertions below.
  useUnitSystemStore.setState({ system: 'auto' });
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
    {
      id: 'i2', raw: '{5|g|Salt}', amount: 5, unit: 'g',
      name: 'Salt', isLocked: true,
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
  it('renders the recipe title, ingredients, and steps at the original yield', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sample Stew' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Beef Chuck/)).toBeInTheDocument();
    expect(screen.getByText(/Sear the beef/)).toBeInTheDocument();
    expect(screen.getByLabelText('Servings')).toHaveValue(4);
  });

  it('scales unlocked ingredients linearly when servings change', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    const servings = screen.getByLabelText('Servings') as HTMLInputElement;
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    expect(servings.value).toBe('8');

    // 800 g → 1.6 kg via metric upgrade after doubling.
    expect(screen.getByText(/Beef Chuck/).closest('li')).toHaveTextContent('1.6');
    expect(screen.getByText(/Beef Chuck/).closest('li')).toHaveTextContent('kg');
  });

  it('does not scale locked ingredients', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));

    // Salt is locked at 5 g — must stay 5, not 10.
    const saltRow = screen.getByText(/Salt/).closest('li')!;
    expect(saltRow).toHaveTextContent('5');
    expect(saltRow).not.toHaveTextContent('10');
  });

  it('shows not-found message for unknown id', async () => {
    renderViewAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument();
    });
  });
});
