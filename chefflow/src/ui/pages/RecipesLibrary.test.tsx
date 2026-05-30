import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecipesLibrary from './RecipesLibrary';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

vi.mock('../../core/tier/quotaClient', async () => {
  const actual = await vi.importActual<typeof import('../../core/tier/quotaClient')>(
    '../../core/tier/quotaClient'
  );
  return {
    ...actual,
    consumeDailyQuota: vi.fn(async () => ({ count: 0, remaining: null, limit: 0 })),
  };
});

beforeEach(async () => {
  await db.recipes.clear();
  await db.events.clear();
  await db.menus.clear();
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

const cake: Recipe = {
  id: 'r_test_002',
  title: 'Chocolate Cake',
  originalYield: 8,
  ingredients: [],
  steps: [],
  createdAt: 2,
  updatedAt: 2,
};

async function openActions(recipeTitle: string) {
  const card = screen.getByRole('link', { name: recipeTitle }).closest('article')!;
  const trigger = card.querySelector('button[aria-label="Recipe actions"]') as HTMLButtonElement;
  await userEvent.click(trigger);
}

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
    await openActions('Beef Stew');
    await userEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }));
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
      await openActions('Beef Stew');
      await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
      // The recipe is soft-deleted (tombstone retained for sync), so query
      // via the repo, which filters out `isDeleted` rows. The user-visible
      // contract — "delete removes the recipe from the library" — still holds.
      const { listRecipes } = await import('../../db/recipesRepo');
      await waitFor(async () => {
        expect((await listRecipes()).length).toBe(0);
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('filters visible cards by the search input', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();

    const input = screen.getByTestId('recipes-search-input');
    await userEvent.type(input, 'cake');

    await waitFor(() => {
      expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('clear button resets the search', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    const input = screen.getByTestId('recipes-search-input');
    await userEvent.type(input, 'cake');
    await waitFor(() => {
      expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));

    await waitFor(() => {
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('shows no-results message when the search matches nothing', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    const input = screen.getByTestId('recipes-search-input');
    await userEvent.type(input, 'zzzzzz');

    await waitFor(() => {
      expect(screen.getByTestId('recipes-no-results')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recipes-no-results').textContent).toMatch(/zzzzzz/);
    expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
  });

  it('shows the "Create menu" button when recipes exist', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));
    expect(screen.getByTestId('recipes-create-menu-button')).toBeInTheDocument();
  });

  it('entering select mode renders checkbox toggles on each card', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    expect(screen.queryByTestId('recipes-select-checkbox-r_test_001')).toBeNull();

    await userEvent.click(screen.getByTestId('recipes-create-menu-button'));

    expect(screen.getByTestId('recipes-select-checkbox-r_test_001')).toBeInTheDocument();
    expect(screen.getByTestId('recipes-select-checkbox-r_test_002')).toBeInTheDocument();
    expect(screen.getByTestId('recipes-combine-button')).toBeDisabled();
    expect(screen.getByTestId('recipes-cancel-select')).toBeInTheDocument();
  });

  it('selecting recipes and confirming creates a menu, stays on /recipes, and activates the new menu chip', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    await userEvent.click(screen.getByTestId('recipes-create-menu-button'));
    await userEvent.click(screen.getByTestId('recipes-select-checkbox-r_test_001'));
    await userEvent.click(screen.getByTestId('recipes-select-checkbox-r_test_002'));

    const combine = screen.getByTestId('recipes-combine-button');
    expect(combine).toBeEnabled();
    expect(combine.textContent).toMatch(/Combine 2 into menu/);

    await userEvent.click(combine);

    const titleInput = await screen.findByTestId('create-menu-title-input');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Saturday Service');

    await userEvent.click(screen.getByTestId('create-menu-confirm'));

    await waitFor(async () => {
      expect(await db.menus.count()).toBe(1);
    });
    const menus = await db.menus.toArray();
    const menu = menus[0];
    expect(menu.title).toBe('Saturday Service');
    expect([...menu.recipeIds].sort()).toEqual(['r_test_001', 'r_test_002']);
    expect(menu.id).toMatch(/^m_/);
    expect(await db.events.count()).toBe(0);

    const chip = await screen.findByTestId(`recipes-filter-chip-${menu.id}`);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('recipes-filter-chip-all')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // Stayed on /recipes: the cards (and the search input) are still mounted.
    expect(screen.getByTestId('recipes-search-input')).toBeInTheDocument();
  });

  it('does not render the chip row when no menus exist', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));
    expect(screen.queryByTestId('recipes-filter-chip-row')).toBeNull();
  });

  it('clicking a menu chip filters the grid to that menu and All resets', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    await db.menus.put({
      id: 'm_seed_1',
      title: 'Cake Night',
      recipeIds: ['r_test_002'],
      createdAt: 1,
      updatedAt: 1,
    });
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    const menuChip = screen.getByTestId('recipes-filter-chip-m_seed_1');
    await userEvent.click(menuChip);

    await waitFor(() => {
      expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
    expect(menuChip).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByTestId('recipes-filter-chip-all'));

    await waitFor(() => {
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('deleting a chip removes the menu and resets the active filter when needed', async () => {
    await db.recipes.put(stew);
    await db.menus.put({
      id: 'm_seed_2',
      title: 'Solo',
      recipeIds: ['r_test_001'],
      createdAt: 1,
      updatedAt: 1,
    });

    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      renderPage();
      await waitFor(() => screen.getByTestId('recipes-filter-chip-m_seed_2'));

      await userEvent.click(screen.getByTestId('recipes-filter-chip-m_seed_2'));
      expect(screen.getByTestId('recipes-filter-chip-m_seed_2')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await userEvent.click(
        screen.getByTestId('recipes-filter-chip-delete-m_seed_2')
      );

      // Repo filters tombstones; check via listMenus, not raw db.menus.count.
      const { listMenus } = await import('../../db/menusRepo');
      await waitFor(async () => {
        expect((await listMenus()).length).toBe(0);
      });
      expect(screen.queryByTestId('recipes-filter-chip-m_seed_2')).toBeNull();
      // Chip row disappears entirely because there are no menus left.
      expect(screen.queryByTestId('recipes-filter-chip-row')).toBeNull();
      // Grid is back to showing all recipes.
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('menu filter and search combine — search narrows within the active menu', async () => {
    await db.recipes.put(stew);
    await db.recipes.put(cake);
    await db.menus.put({
      id: 'm_seed_3',
      title: 'Both',
      recipeIds: ['r_test_001', 'r_test_002'],
      createdAt: 1,
      updatedAt: 1,
    });
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    await userEvent.click(screen.getByTestId('recipes-filter-chip-m_seed_3'));
    expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('recipes-search-input'), 'cake');

    await waitFor(() => {
      expect(screen.queryByText('Beef Stew')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
  });

  it('shows "This menu is empty" when the active menu has no matching recipes', async () => {
    await db.recipes.put(stew);
    await db.menus.put({
      id: 'm_seed_4',
      title: 'Ghost',
      recipeIds: ['r_does_not_exist'],
      createdAt: 1,
      updatedAt: 1,
    });
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));

    await userEvent.click(screen.getByTestId('recipes-filter-chip-m_seed_4'));

    await waitFor(() => {
      expect(screen.getByTestId('recipes-no-results')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recipes-no-results').textContent).toMatch(
      /this menu is empty/i
    );
  });
});

describe('RecipesLibrary — Mine vs Shared scope filter (T3c follow-up)', () => {
  // Why these matter: when a chef joins an Enterprise team, their library
  // mixes own recipes with shared (read-only) ones. The scope chips are
  // the primary UI distinction beyond the small "Shared" tag — getting
  // them wrong leaks shared rows into "Mine" (chef can't trust the
  // filter) or hides own rows under "Shared" (chef thinks they were
  // demoted). Tests pin the count derivation + filtering branches.

  it('does NOT render the chip row when the chef has zero shared recipes (99% case)', async () => {
    await db.recipes.bulkPut([stew, cake]); // both owned by the chef
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('recipes-scope-chip-row')).toBeNull();
  });

  it('renders one chip per team (T6) using the worker-decorated team name; All + Mine show overall counts', async () => {
    await db.recipes.bulkPut([
      stew,                                              // mine
      cake,                                              // mine
      { ...stew, id: 'r_morning_1', title: 'Owner Lamb',  readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_morning', teamName: 'Morning shift' },
      { ...stew, id: 'r_morning_2', title: 'Owner Sauce', readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_morning', teamName: 'Morning shift' },
      { ...stew, id: 'r_evening_1', title: 'Owner Stock', readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_evening', teamName: 'Evening shift' },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('recipes-scope-chip-row')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recipes-scope-all')).toHaveTextContent('All (5)');
    expect(screen.getByTestId('recipes-scope-mine')).toHaveTextContent('Mine (2)');
    expect(screen.getByTestId('recipes-scope-grp_morning')).toHaveTextContent('Morning shift (2)');
    expect(screen.getByTestId('recipes-scope-grp_evening')).toHaveTextContent('Evening shift (1)');
  });

  it('clicking "Mine" hides shared cards', async () => {
    await db.recipes.bulkPut([
      stew,
      { ...stew, id: 'r_shared_1', title: 'Owner Lamb', readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_a', teamName: 'Team A' },
    ]);
    renderPage();
    await waitFor(() => screen.getByTestId('recipes-scope-chip-row'));
    await userEvent.click(screen.getByTestId('recipes-scope-mine'));
    expect(screen.getByText('Beef Stew')).toBeInTheDocument();
    expect(screen.queryByText('Owner Lamb')).toBeNull();
  });

  it('clicking a team chip scopes to only that team\'s shared cards (T6)', async () => {
    await db.recipes.bulkPut([
      stew,
      { ...stew, id: 'r_morning', title: 'Owner Lamb',  readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_morning', teamName: 'Morning shift' },
      { ...stew, id: 'r_evening', title: 'Owner Stock', readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_evening', teamName: 'Evening shift' },
    ]);
    renderPage();
    await waitFor(() => screen.getByTestId('recipes-scope-chip-row'));
    await userEvent.click(screen.getByTestId('recipes-scope-grp_morning'));
    expect(screen.queryByText('Beef Stew')).toBeNull();
    expect(screen.getByText('Owner Lamb')).toBeInTheDocument();
    expect(screen.queryByText('Owner Stock')).toBeNull();
  });

  it('renders the team NAME on the shared-card tag, not the generic "Shared" label (T6)', async () => {
    await db.recipes.bulkPut([
      { ...stew, id: 'r_morning', title: 'Owner Lamb', readOnly: true, ownerUserId: 'user_owner', teamId: 'grp_morning', teamName: 'Morning shift' },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('recipe-card-shared-tag')).toHaveTextContent('Morning shift');
    });
  });
});
