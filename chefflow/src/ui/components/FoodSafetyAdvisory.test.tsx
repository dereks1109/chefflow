import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FoodSafetyAdvisory from './FoodSafetyAdvisory';

describe('FoodSafetyAdvisory', () => {
  it('renders the default message in compact variant', () => {
    render(<FoodSafetyAdvisory />);
    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/AI-assisted/i);
    expect(note.textContent).toMatch(/verify before serving/i);
  });

  it('honours a custom message', () => {
    render(<FoodSafetyAdvisory message="Custom advisory line." />);
    expect(screen.getByRole('note').textContent).toMatch(/Custom advisory line/);
  });

  it('renders the block variant with different styling', () => {
    render(<FoodSafetyAdvisory variant="block" />);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
