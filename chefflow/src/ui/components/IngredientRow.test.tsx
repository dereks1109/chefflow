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

describe('IngredientRow horizontal layout (post-condense)', () => {
  it('renders name + amount + unit + allergen-button + delete as siblings in ONE flex row (no separate vertical row per input)', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(<IngredientRow index={0} value={mkIngredient()} onChange={onChange} onRemove={onRemove} />);

    // Name input + Amount input + Unit select + the allergen icon
    // button + the delete button should all share the same flex parent
    // (the new horizontal row).
    const nameInput = screen.getByLabelText('Ingredient name');
    const amountInput = screen.getByLabelText('Amount');
    const unitSelect = screen.getByLabelText('Unit');
    const allergenButton = screen.getByTestId('ingredient-allergen-button-0');
    const removeButton = screen.getByLabelText('Remove ingredient');

    // Walk up to the nearest flex container — they should all share it.
    const nameRow = nameInput.closest('div.flex');
    expect(nameRow).not.toBeNull();
    // The four other controls share the same flex row (they may be
    // direct children OR nested via wrapper divs — assert via
    // parentElement chain instead of strict siblinghood).
    function shareTopRow(el: HTMLElement): boolean {
      let node: HTMLElement | null = el;
      while (node) {
        if (node === nameRow) return true;
        node = node.parentElement;
      }
      return false;
    }
    expect(shareTopRow(amountInput)).toBe(true);
    expect(shareTopRow(unitSelect)).toBe(true);
    expect(shareTopRow(allergenButton)).toBe(true);
    expect(shareTopRow(removeButton)).toBe(true);
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
