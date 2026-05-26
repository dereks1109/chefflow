import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AllergenPill } from './AllergenBadge';

afterEach(() => cleanup());

describe('AllergenPill tooltip', () => {
  it('renders the "Flagged on" numbered list when ingredients are provided', () => {
    render(<AllergenPill tag="milk" ingredients={['butter', 'cream']} />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Flagged on')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
    expect(screen.getByText('cream')).toBeInTheDocument();
  });

  it('still renders a tooltip surface when ingredients is undefined — the chef must always be able to hover the pill', () => {
    // The pill is reachable for keyboard + touch even when the recipe-level
    // declaration has no specific ingredient flagged.
    render(<AllergenPill tag="gluten" />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Declared at recipe level')).toBeInTheDocument();
    expect(screen.getByText(/No specific ingredient flagged/i)).toBeInTheDocument();
  });

  it('renders the same fallback when ingredients is an empty array', () => {
    render(<AllergenPill tag="eggs" ingredients={[]} />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Declared at recipe level')).toBeInTheDocument();
  });

  it('pill is focusable when ingredients are provided', () => {
    render(<AllergenPill tag="milk" ingredients={['butter']} />);
    expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
  });

  it('pill stays focusable even when ingredients are missing — keyboard parity with mouse hover', () => {
    render(<AllergenPill tag="milk" />);
    expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
  });

  it('aria-label includes the flagged-on summary so screen readers get the full picture in one announcement', () => {
    render(<AllergenPill tag="milk" ingredients={['butter', 'cream']} />);
    const pill = screen.getByLabelText(/Flagged on: butter, cream/i);
    expect(pill).toBeInTheDocument();
  });

  it('aria-label falls back to a recipe-level sentence when no ingredients are provided', () => {
    render(<AllergenPill tag="gluten" />);
    expect(
      screen.getByLabelText(/Declared at recipe level by the chef/i),
    ).toBeInTheDocument();
  });
});
