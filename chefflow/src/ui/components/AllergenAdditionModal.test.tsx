import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import AllergenAdditionModal from './AllergenAdditionModal';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AllergenAdditionModal', () => {
  it('does not render when open=false', () => {
    render(
      <AllergenAdditionModal
        open={false}
        allergenLabel="Milk"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('allergen-add-modal')).toBeNull();
  });

  it('renders the allergen label + ingredient context when both are supplied', () => {
    render(
      <AllergenAdditionModal
        open
        allergenLabel="Milk"
        ingredientName="butter"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const heading = screen.getByRole('dialog');
    expect(heading.textContent).toContain('Milk');
    expect(heading.textContent).toContain('butter');
  });

  it('Confirm button is disabled until BOTH the checkbox is ticked AND the 5s cooldown elapses', () => {
    const onConfirm = vi.fn();
    render(
      <AllergenAdditionModal
        open
        allergenLabel="Eggs"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByTestId('allergen-add-confirm') as HTMLButtonElement;
    // t=0: cooldown not done, checkbox unticked → disabled.
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain('Confirm (5)');

    // Tick the box at t=0 — still disabled because cooldown not done.
    fireEvent.click(screen.getByTestId('allergen-add-confirm-check'));
    expect(confirm.disabled).toBe(true);

    // Advance 5 seconds.
    // Cooldown uses setTimeout chained via useEffect — each tick re-runs
    // the effect to schedule the next timeout, so we step second-by-second
    // with act() so React commits the secondsLeft update before the next
    // tick schedules.
    for (let i = 0; i < 5; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect(confirm.textContent).toContain('Confirm — add flag');
    expect(confirm.disabled).toBe(false);

    // Untick → disabled again even though cooldown is done.
    fireEvent.click(screen.getByTestId('allergen-add-confirm-check'));
    expect(confirm.disabled).toBe(true);

    // Re-tick → enabled (cooldown already done, no need to wait again).
    fireEvent.click(screen.getByTestId('allergen-add-confirm-check'));
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel fires onCancel from both the bottom button and the corner X', () => {
    const onCancel = vi.fn();
    render(
      <AllergenAdditionModal
        open
        allergenLabel="Milk"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('allergen-add-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('allergen-add-cancel-x'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('resets cooldown + confirmed state every time the modal re-opens', () => {
    const { rerender } = render(
      <AllergenAdditionModal
        open
        allergenLabel="Milk"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // Race through to ready state.
    fireEvent.click(screen.getByTestId('allergen-add-confirm-check'));
    // Cooldown uses setTimeout chained via useEffect — each tick re-runs
    // the effect to schedule the next timeout, so we step second-by-second
    // with act() so React commits the secondsLeft update before the next
    // tick schedules.
    for (let i = 0; i < 5; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect((screen.getByTestId('allergen-add-confirm') as HTMLButtonElement).disabled).toBe(false);

    // Close + reopen.
    rerender(
      <AllergenAdditionModal
        open={false}
        allergenLabel="Milk"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    rerender(
      <AllergenAdditionModal
        open
        allergenLabel="Milk"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const confirm = screen.getByTestId('allergen-add-confirm') as HTMLButtonElement;
    expect(confirm.textContent).toContain('Confirm (5)');
    expect(confirm.disabled).toBe(true);
  });
});
