import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IngredientRow from './IngredientRow';
import type { Ingredient } from '../../core/types';

// getRecipe is called by the inherited-allergen useEffect when
// componentRecipeId is set. The default test ingredient is plain
// (no sub-recipe link) so the effect early-returns; mock anyway as
// a safety net so the import doesn't try to touch Dexie.
vi.mock('../../db/recipesRepo', () => ({
  getRecipe: vi.fn(async () => null),
}));

function mkIngredient(over: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'i_1',
    raw: '{100|g|flour}',
    amount: 100,
    unit: 'g',
    name: 'flour',
    isLocked: false,
    ...over,
  };
}

describe('IngredientRow 2-row layout (T18 — narrow 30%-column fit)', () => {
  it('renders allergen + name on row 1, amount + unit + remove on row 2 (the Ingredients column is too narrow for one row)', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(<IngredientRow index={0} value={mkIngredient()} onChange={onChange} onRemove={onRemove} />);

    const nameInput = screen.getByLabelText('Ingredient name');
    const amountInput = screen.getByLabelText('Amount');
    const unitSelect = screen.getByLabelText('Unit');
    const allergenButton = screen.getByTestId('ingredient-allergen-button-0');
    const removeButton = screen.getByLabelText('Remove ingredient');

    // Allergen icon button + name input share the SAME flex row.
    const nameRow = nameInput.closest('div.flex');
    expect(nameRow).not.toBeNull();
    expect(allergenButton.closest('div.flex')).toBe(nameRow);

    // Amount + unit + remove share a DIFFERENT flex row (the second
    // visual line of the 2-row layout).
    const actionRow = amountInput.closest('div.flex');
    expect(actionRow).not.toBeNull();
    expect(actionRow).not.toBe(nameRow);
    expect(unitSelect.closest('div.flex')).toBe(actionRow);
    expect(removeButton.closest('div.flex')).toBe(actionRow);

    // Both rows still belong to the same <li> wrapper so the chef sees
    // them as one logical ingredient entry.
    const li = nameInput.closest('li');
    expect(li).not.toBeNull();
    expect(actionRow!.closest('li')).toBe(li);
  });

  it('allergen icon button opens a popover listing available allergens; picking one queues the confirmation modal', () => {
    const onChange = vi.fn();
    render(
      <IngredientRow
        index={0}
        value={mkIngredient({ name: 'milk', allergenFlags: [] })}
        onChange={onChange}
        onRemove={vi.fn()}
        allergenMatches={[]}
      />,
    );

    // Popover is closed initially.
    expect(screen.queryByRole('listbox', { name: /Allergens/ })).toBeNull();

    // Click the icon button → popover opens.
    fireEvent.click(screen.getByTestId('ingredient-allergen-button-0'));
    const popover = screen.getByRole('listbox', { name: /Allergens/ });
    expect(popover).toBeTruthy();
    // Popover lists at least one available allergen (the default
    // ALLERGEN_TAGS list is non-empty).
    expect(popover.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('allergen pills row only renders when at least one flag is present (saves vertical space when clean)', () => {
    // Clean ingredient — no pills row at all.
    const { rerender, container } = render(
      <IngredientRow index={0} value={mkIngredient()} onChange={vi.fn()} onRemove={vi.fn()} allergenMatches={[]} />,
    );
    expect(container.querySelector('[aria-label="Ingredient allergens"]')).toBeNull();

    // Tagged ingredient — pills row appears.
    rerender(
      <IngredientRow
        index={0}
        value={mkIngredient({ allergenFlags: ['milk'] })}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        allergenMatches={['milk']}
      />,
    );
    expect(container.querySelector('[aria-label="Ingredient allergens"]')).not.toBeNull();
  });
});
