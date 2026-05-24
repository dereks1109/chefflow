import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { clerkMockSignedIn } from '../../test-helpers/clerkMock';

vi.mock('@clerk/clerk-react', () => clerkMockSignedIn('user_view_test'));

import RecipeView from './RecipeView';
import { db } from '../../db/dexie';
import { setCurrentUserId } from '../../state/currentUser';
import { useUnitSystemStore } from '../../state/unitSystemStore';
import type { Recipe } from '../../core/types';

const TEST_USER = 'user_view_test';

beforeEach(async () => {
  await db.recipes.clear();
  setCurrentUserId(TEST_USER);
  // Pin the unit system to 'auto' so the scaler doesn't perform metric/imperial
  // conversions that would muddy the numeric assertions below.
  useUnitSystemStore.setState({ system: 'auto' });
});

const seed: Recipe = {
  id: 'r_view_seed',
  ownerId: TEST_USER,
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
        <Route path="/recipes" element={<div>Library page</div>} />
        <Route path="/recipes/:id/edit" element={<div>Editor page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RecipeView', () => {
  it('renders title, ingredients, and steps at the original yield', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sample Stew' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Beef Chuck/)).toBeInTheDocument();
    expect(screen.getByText(/Sear the beef/)).toBeInTheDocument();
    expect(screen.getByLabelText('Servings')).toHaveValue(4);
  });

  it('scales unlocked ingredients linearly when servings increase', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    const servings = screen.getByLabelText('Servings') as HTMLInputElement;
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    expect(servings.value).toBe('8');

    // 800 g doubled to 1600 g → metric upgrade normalises to 1.6 kg.
    const beefRow = screen.getByText(/Beef Chuck/).closest('li')!;
    expect(beefRow).toHaveTextContent('1.6');
    expect(beefRow).toHaveTextContent('kg');
  });

  it('does NOT scale locked ingredients', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    // Quadruple the servings — locked salt must stay at 5 g, not 20 g.
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));
    await userEvent.click(screen.getByLabelText('Increase servings'));

    const saltRow = screen.getByText(/Salt/).closest('li')!;
    expect(saltRow).toHaveTextContent('5');
    expect(saltRow).not.toHaveTextContent('20');
  });

  it('decreases below 1 are clamped', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    const servings = screen.getByLabelText('Servings') as HTMLInputElement;
    // 4 → click decrease 6 times — should stop at 1
    for (let i = 0; i < 6; i++) {
      await userEvent.click(screen.getByLabelText('Decrease servings'));
    }
    expect(servings.value).toBe('1');
  });

  it('shows the "scaled from" badge only when portions changed', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });
    expect(screen.queryByText(/scaled from/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Increase servings'));
    expect(screen.getByText(/scaled from 4/)).toBeInTheDocument();
  });

  it('surfaces a Lock icon next to locked ingredients', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    // Salt is locked — Lock icon should appear with the appropriate aria-label
    expect(screen.getByLabelText(/Locked — does not scale/i)).toBeInTheDocument();
  });

  it('shows an Edit button that links to the editor', async () => {
    await db.recipes.put(seed);
    renderViewAt(seed.id);
    const edit = await screen.findByRole('link', { name: /edit/i });
    expect(edit).toHaveAttribute('href', `/recipes/${seed.id}/edit`);
  });

  it('shows not-found message for unknown id', async () => {
    renderViewAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument();
    });
  });

  it('renders allergen pills and the AI-assisted advisory when analysis carries allergens', async () => {
    const withAllergens: Recipe = {
      ...seed,
      id: 'r_allergen',
      analysis: {
        caloriesPerPortion: 880,
        keyIngredientTags: ['beef'],
        allergens: ['milk'],
        source: 'llm-text',
      },
    };
    await db.recipes.put(withAllergens);
    renderViewAt(withAllergens.id);
    await screen.findByRole('heading', { name: 'Sample Stew' });

    expect(screen.getByLabelText(/Allergen: Milk/i)).toBeInTheDocument();
    // Advisory copy from FoodSafetyAdvisory.
    expect(screen.getByText(/verify before serving/i)).toBeInTheDocument();
  });
});
