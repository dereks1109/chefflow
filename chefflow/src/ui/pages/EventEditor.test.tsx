import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EventEditor from './EventEditor';
import { db } from '../../db/dexie';
import { setCurrentUserId } from '../../state/currentUser';
import type { KitchenEvent, Recipe } from '../../core/types';

const TEST_USER = 'user_page_test';

beforeEach(async () => {
  await db.events.clear();
  await db.recipes.clear();
  setCurrentUserId(TEST_USER);
  // Save button now confirms — auto-accept in tests.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const seed: KitchenEvent = {
  id: 'e_seed',
  title: 'Seed Event',
  serveAt: '2026-06-15T18:00:00.000Z',
  notes: '',
  dishes: [],
  createdAt: 1,
  updatedAt: 1,
  ownerId: TEST_USER,
};

const ribeyeRecipe: Recipe = {
  id: 'r_test_ribeye',
  title: 'Ribeye',
  originalYield: 2,
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
  ownerId: TEST_USER,
};

function renderEditorAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/${id}/edit`]}>
      <Routes>
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/events/:id" element={<div>View</div>} />
        <Route path="/events" element={<div>Library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EventEditor', () => {
  it('loads an existing event and shows its title', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Seed Event')).toBeInTheDocument();
    });
  });

  it('shows not-found message for unknown event id', async () => {
    renderEditorAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });

  it('adds a dish via Confirm and persists it on Save', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add dish/i }));
    await userEvent.type(screen.getByLabelText(/dish name/i), 'Roast veg');
    await userEvent.click(screen.getByRole('button', { name: /confirm dish/i }));

    // Dish should now show in compact form
    expect(screen.getByText('Roast veg')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(async () => {
      const updated = await db.events.get(seed.id);
      expect(updated?.dishes).toHaveLength(1);
      expect(updated?.dishes[0].name).toBe('Roast veg');
      expect(updated?.dishes[0].portions).toBe(1);
    });
  });

  it('Cancel on a new dish draft discards it', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add dish/i }));
    await userEvent.type(screen.getByLabelText(/dish name/i), 'Temp');
    await userEvent.click(screen.getByRole('button', { name: /cancel dish/i }));

    expect(screen.queryByText('Temp')).toBeNull();
    expect(screen.getByText(/no dishes or sections yet/i)).toBeInTheDocument();
  });

  it('suggests an existing recipe in the dish name input', async () => {
    await db.recipes.put(ribeyeRecipe);
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add dish/i }));
    await userEvent.type(screen.getByLabelText(/dish name/i), 'Rib');

    // The suggestion button shows the recipe title
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ribeye/i })).toBeInTheDocument();
    });
  });

  it('offers "Create new recipe" and "I\'ll get the dish ready" when nothing matches', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add dish/i }));
    await userEvent.type(screen.getByLabelText(/dish name/i), 'Mystery casserole');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create new recipe/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /the dish is ready to go/i })).toBeInTheDocument();
    });
  });

  it('"I\'ll get the dish ready" sets isPrepared=true on Confirm', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add dish/i }));
    await userEvent.type(screen.getByLabelText(/dish name/i), 'Bakery rolls');

    await userEvent.click(await screen.findByRole('button', { name: /the dish is ready to go/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm dish/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(async () => {
      const updated = await db.events.get(seed.id);
      expect(updated?.dishes[0].isPrepared).toBe(true);
      expect(updated?.dishes[0].recipeId).toBeUndefined();
    });
  });
});
