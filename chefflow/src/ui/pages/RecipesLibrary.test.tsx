import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecipesLibrary from './RecipesLibrary';
import { db } from '../../db/dexie';
import { setCurrentUserId } from '../../state/currentUser';
import type { Recipe } from '../../core/types';

const TEST_USER = 'user_page_test';

beforeEach(async () => {
  await db.recipes.clear();
  setCurrentUserId(TEST_USER);
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
  ownerId: TEST_USER,
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
      // Soft-delete: row stays as a tombstone (for sync), but the listing
      // filters it out so the UI shows the empty state.
      await waitFor(() => {
        expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
      });
      const raw = await db.recipes.get('r_test_001');
      expect(raw?.deletedAt).toBeGreaterThan(0);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
