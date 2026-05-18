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
