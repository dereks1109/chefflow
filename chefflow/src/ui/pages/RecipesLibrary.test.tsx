import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecipesLibrary from './RecipesLibrary';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RecipesLibrary />
    </MemoryRouter>
  );
}

const stew: Recipe = {
  id: 'r_test_001',
  title: 'Beef Stew',
  originalYield: 4,
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('RecipesLibrary', () => {
  it('shows empty state when no recipes exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /create your first recipe/i })).toBeInTheDocument();
  });

  it('lists saved recipes', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Beef Stew' })).toBeInTheDocument();
    });
  });

  it('duplicates a recipe with a new id', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));
    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }));
    await waitFor(async () => {
      const all = await db.recipes.toArray();
      expect(all).toHaveLength(2);
      const dup = all.find((r) => r.id !== 'r_test_001')!;
      expect(dup.title).toBe('Beef Stew (copy)');
    });
  });

  it('deletes a recipe after confirm', async () => {
    await db.recipes.put(stew);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      renderPage();
      await waitFor(() => screen.getByText('Beef Stew'));
      await userEvent.click(screen.getByRole('button', { name: /delete/i }));
      await waitFor(async () => {
        expect(await db.recipes.count()).toBe(0);
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
