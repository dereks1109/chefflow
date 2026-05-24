import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IngredientRow, { blankIngredient } from './IngredientRow';
import type { Ingredient } from '../../core/types';

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function makeIng(overrides: Partial<Ingredient> = {}): Ingredient {
  return { ...blankIngredient(), name: 'Salt', amount: 5, unit: 'g', ...overrides };
}

describe('IngredientRow — lock toggle', () => {
  it('renders an Unlock button when the ingredient is not locked', () => {
    const onChange = vi.fn();
    render(
      <ul>
        <IngredientRow
          index={0}
          value={makeIng({ isLocked: false })}
          onChange={onChange}
          onRemove={() => {}}
        />
      </ul>,
    );
    expect(
      screen.getByRole('button', { name: /Lock — keep this amount fixed/i }),
    ).toBeInTheDocument();
  });

  it('renders a Lock button when the ingredient is locked', () => {
    const onChange = vi.fn();
    render(
      <ul>
        <IngredientRow
          index={0}
          value={makeIng({ isLocked: true })}
          onChange={onChange}
          onRemove={() => {}}
        />
      </ul>,
    );
    expect(
      screen.getByRole('button', { name: /Unlock — let this ingredient scale/i }),
    ).toBeInTheDocument();
  });

  it('clicking the toggle flips isLocked through onChange', () => {
    const onChange = vi.fn();
    const ing = makeIng({ isLocked: false });
    render(
      <ul>
        <IngredientRow index={0} value={ing} onChange={onChange} onRemove={() => {}} />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Lock — keep this amount fixed/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].isLocked).toBe(true);
  });

  it('locked ingredient preserves the aria-pressed=true state', () => {
    const onChange = vi.fn();
    render(
      <ul>
        <IngredientRow
          index={0}
          value={makeIng({ isLocked: true })}
          onChange={onChange}
          onRemove={() => {}}
        />
      </ul>,
    );
    expect(
      screen.getByRole('button', { name: /Unlock — let this ingredient scale/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
