import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecipeAutocomplete from './RecipeAutocomplete';
import type { Recipe } from '../../core/types';

vi.mock('../../db/recipesRepo', () => ({
  listRecipes: vi.fn(),
}));

import { listRecipes } from '../../db/recipesRepo';

function makeRecipe(id: string, title: string, yieldPortions = 1): Recipe {
  return {
    id, title, originalYield: yieldPortions,
    ingredients: [], steps: [],
    createdAt: 0, updatedAt: 0,
  };
}

const ALL = [
  makeRecipe('r_steak', '(Demo) Ribeye'),
  makeRecipe('r_sauce', '(Demo) Black Pepper Sauce', 4),
  makeRecipe('r_salad', '(Demo) Garden Salad'),
];

beforeEach(() => {
  vi.mocked(listRecipes).mockResolvedValue(ALL);
});

describe('RecipeAutocomplete', () => {
  it('filters by query case-insensitively', async () => {
    render(<RecipeAutocomplete query="pepper" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('(Demo) Black Pepper Sauce')).toBeInTheDocument());
    expect(screen.queryByText('(Demo) Ribeye')).not.toBeInTheDocument();
  });

  it('excludes the current recipe id when excludeRecipeId is given', async () => {
    render(
      <RecipeAutocomplete query="" excludeRecipeId="r_steak" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('(Demo) Black Pepper Sauce')).toBeInTheDocument());
    expect(screen.queryByText('(Demo) Ribeye')).not.toBeInTheDocument();
  });

  it('calls onSelect when a row is clicked', async () => {
    const onSelect = vi.fn();
    render(<RecipeAutocomplete query="" onSelect={onSelect} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('(Demo) Ribeye'));
    fireEvent.click(screen.getByText('(Demo) Black Pepper Sauce'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r_sauce' }));
  });

  it('arrow keys move the active option and Enter selects it', async () => {
    const onSelect = vi.fn();
    render(<RecipeAutocomplete query="" onSelect={onSelect} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('(Demo) Ribeye'));
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r_sauce' }));
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(<RecipeAutocomplete query="" onSelect={vi.fn()} onClose={onClose} />);
    await waitFor(() => screen.getByText('(Demo) Ribeye'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state when nothing matches', async () => {
    render(<RecipeAutocomplete query="zzz-no-match" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/No matching recipes/i));
  });
});
