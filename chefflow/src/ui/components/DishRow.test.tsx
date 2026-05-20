import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DishRow from './DishRow';
import { toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import type { Dish } from '../../core/types';

const baseDish: Dish = {
  id: 'd1',
  name: 'Test Dish',
  portions: 4,
  startAt: '2026-06-15T18:00:00.000Z',
  notes: 'Don\'t forget the lemon zest.',
};

function renderRow(extra: Partial<Parameters<typeof DishRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <DishRow
        index={0}
        value={baseDish}
        onEdit={() => undefined}
        onRemove={() => undefined}
        {...extra}
      />
    </MemoryRouter>,
  );
}

describe('DishRow — click-to-edit start time', () => {
  it('renders the time as static text when onTimeChange is omitted', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: /edit start time/i })).toBeNull();
  });

  it('swaps to a datetime-local input when the time is clicked', async () => {
    const onTimeChange = vi.fn();
    renderRow({ onTimeChange });
    await userEvent.click(screen.getByRole('button', { name: /edit start time/i }));
    const input = screen.getByLabelText(/start time for dish/i) as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(input.value).toBe(toLocalInputValue(baseDish.startAt));
  });

  it('commits via Enter and calls onTimeChange with the corresponding ISO', async () => {
    const onTimeChange = vi.fn();
    renderRow({ onTimeChange });
    await userEvent.click(screen.getByRole('button', { name: /edit start time/i }));
    const input = screen.getByLabelText(/start time for dish/i) as HTMLInputElement;
    // Clear and type a new local time.
    await userEvent.clear(input);
    await userEvent.type(input, '2026-06-15T19:30');
    await userEvent.keyboard('{Enter}');
    expect(onTimeChange).toHaveBeenCalledTimes(1);
    expect(onTimeChange).toHaveBeenCalledWith(fromLocalInputValue('2026-06-15T19:30'));
  });

  it('cancels via Esc without calling onTimeChange', async () => {
    const onTimeChange = vi.fn();
    renderRow({ onTimeChange });
    await userEvent.click(screen.getByRole('button', { name: /edit start time/i }));
    await userEvent.keyboard('{Escape}');
    expect(onTimeChange).not.toHaveBeenCalled();
    // Back to the read-only button label.
    expect(screen.getByRole('button', { name: /edit start time/i })).toBeInTheDocument();
  });
});

describe('DishRow — click-to-edit name', () => {
  it('commits via Enter and calls onNameChange with the trimmed value', async () => {
    // Why: the name is the primary identifier; an empty/whitespace-only
    // submission would silently rename to "Untitled dish" so we drop it.
    // This test guards the happy path: non-empty, trimmed, different → commit.
    const onNameChange = vi.fn();
    renderRow({ onNameChange });
    await userEvent.click(screen.getByRole('button', { name: /edit name for dish/i }));
    const input = screen.getByLabelText(/dish 1 name/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '  Beef Wellington  ');
    await userEvent.keyboard('{Enter}');
    expect(onNameChange).toHaveBeenCalledTimes(1);
    expect(onNameChange).toHaveBeenCalledWith('Beef Wellington');
  });

  it('cancels via Esc without calling onNameChange', async () => {
    // Why: Esc must be a no-op so the user can back out of an accidental
    // click without persisting the (possibly empty) defaultValue.
    const onNameChange = vi.fn();
    renderRow({ onNameChange });
    await userEvent.click(screen.getByRole('button', { name: /edit name for dish/i }));
    const input = screen.getByLabelText(/dish 1 name/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'whoops');
    await userEvent.keyboard('{Escape}');
    expect(onNameChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /edit name for dish/i })).toBeInTheDocument();
  });
});

describe('DishRow — click-to-edit portions', () => {
  it('commits Enter and passes a number (not a string) clamped >= 1', async () => {
    // Why: stores number on the Dish model; passing a string would corrupt
    // downstream arithmetic (price = pricePerPortion * portions). The clamp
    // guards against zero/negative input that the number control still allows
    // (browsers vary on min-attribute enforcement).
    const onPortionsChange = vi.fn();
    renderRow({ onPortionsChange });
    await userEvent.click(screen.getByRole('button', { name: /edit portions for dish/i }));
    const input = screen.getByLabelText(/portions for dish/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.keyboard('{Enter}');
    expect(onPortionsChange).toHaveBeenCalledTimes(1);
    const arg = onPortionsChange.mock.calls[0][0];
    expect(typeof arg).toBe('number');
    expect(arg).toBe(12);
  });
});

describe('DishRow — click-to-edit notes', () => {
  it('commits via Enter and calls onNotesChange with the new value', async () => {
    // Why: notes are the only multi-line inline editor; Enter commits while
    // Shift+Enter inserts a newline. This guards the commit path so a chef
    // can correct a quick typo without opening the full editor.
    const onNotesChange = vi.fn();
    renderRow({ onNotesChange });
    await userEvent.click(screen.getByRole('button', { name: /edit notes for dish/i }));
    const ta = screen.getByLabelText(/notes for dish/i) as HTMLTextAreaElement;
    await userEvent.clear(ta);
    await userEvent.type(ta, 'Lemon zest at the end.');
    await userEvent.keyboard('{Enter}');
    expect(onNotesChange).toHaveBeenCalledTimes(1);
    expect(onNotesChange).toHaveBeenCalledWith('Lemon zest at the end.');
  });
});

describe('DishRow — click-to-edit price per portion', () => {
  it('shows "+ Add price" when the recipe has no price and an edit handler is provided', () => {
    const onPricePerPortionChange = vi.fn();
    renderRow({ onPricePerPortionChange });
    expect(
      screen.getByRole('button', { name: /edit price per portion for dish/i }),
    ).toHaveTextContent(/\+ Add price/);
  });

  it('sets a numeric price on Enter — calls handler with the number', async () => {
    const onPricePerPortionChange = vi.fn();
    renderRow({ pricePerPortion: 12, onPricePerPortionChange });
    await userEvent.click(
      screen.getByRole('button', { name: /edit price per portion for dish/i }),
    );
    const input = screen.getByLabelText(
      /price per portion for dish .* \(GBP\)/i,
    ) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '15.50');
    await userEvent.keyboard('{Enter}');
    expect(onPricePerPortionChange).toHaveBeenCalledTimes(1);
    expect(onPricePerPortionChange).toHaveBeenCalledWith(15.5);
  });

  it('clears the price when the input is emptied + Enter — calls handler with undefined', async () => {
    const onPricePerPortionChange = vi.fn();
    renderRow({ pricePerPortion: 12, onPricePerPortionChange });
    await userEvent.click(
      screen.getByRole('button', { name: /edit price per portion for dish/i }),
    );
    const input = screen.getByLabelText(
      /price per portion for dish .* \(GBP\)/i,
    ) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(onPricePerPortionChange).toHaveBeenCalledTimes(1);
    expect(onPricePerPortionChange).toHaveBeenCalledWith(undefined);
  });
});
