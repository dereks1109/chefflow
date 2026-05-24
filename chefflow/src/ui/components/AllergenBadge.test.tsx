import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AllergenPill, UncertainAllergenPill } from './AllergenBadge';

afterEach(() => cleanup());

describe('AllergenPill tooltip', () => {
  it('renders the "Caused by" numbered list when ingredients are provided', () => {
    render(<AllergenPill tag="milk" ingredients={['butter', 'cream']} />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Caused by')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
    expect(screen.getByText('cream')).toBeInTheDocument();
  });

  it('still renders a tooltip surface when ingredients is undefined — the chef must always be able to hover the pill to learn WHY', () => {
    // This is the Dumpling-case fix: gluten is declared on the recipe but
    // no ingredient's name matches the regex. Previously the tooltip span
    // was conditionally rendered, leaving the pill un-hoverable. The
    // fallback explains what the chef can do about it.
    render(<AllergenPill tag="gluten" />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Declared at recipe level')).toBeInTheDocument();
    expect(
      screen.getByText(/no specific ingredient identified/i),
    ).toBeInTheDocument();
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

  it('aria-label includes the caused-by summary so screen readers get the full picture in one announcement', () => {
    render(<AllergenPill tag="milk" ingredients={['butter', 'cream']} />);
    const pill = screen.getByLabelText(/Caused by: butter, cream/i);
    expect(pill).toBeInTheDocument();
  });

  it('aria-label falls back to the "declared at recipe level" sentence when no ingredients are provided', () => {
    render(<AllergenPill tag="gluten" />);
    expect(
      screen.getByLabelText(/Declared at recipe level — no specific ingredient identified/i),
    ).toBeInTheDocument();
  });
});

describe('UncertainAllergenPill', () => {
  it('shows the AI-to-review count + tooltip listing the uncertain ingredient names', () => {
    render(<UncertainAllergenPill count={2} ingredients={['house chilli paste', 'secret marinade']} />);
    expect(screen.getByText(/AI to review \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('AI cannot recognise')).toBeInTheDocument();
    expect(screen.getByText('house chilli paste')).toBeInTheDocument();
    expect(screen.getByText('secret marinade')).toBeInTheDocument();
  });

  it('tooltip surface is always in the DOM (mirrors the AllergenPill always-render fix)', () => {
    render(<UncertainAllergenPill count={1} ingredients={['xo sauce']} />);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('aria-label carries the human-readable summary so screen readers get the full picture in one announcement', () => {
    render(<UncertainAllergenPill count={1} ingredients={['xo sauce']} />);
    expect(
      screen.getByLabelText(/AI to review \(1\)\. AI uncertain about: xo sauce\. Please verify before serving/i),
    ).toBeInTheDocument();
  });

  it('keeps the pill keyboard-focusable so chefs can tab to the warning', () => {
    render(<UncertainAllergenPill count={1} ingredients={['xo sauce']} />);
    expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
  });

  it('falls back gracefully when the ingredients list is empty but count is non-zero', () => {
    // Edge case: callers shouldn't render this, but the pill must not crash.
    render(<UncertainAllergenPill count={3} ingredients={[]} />);
    expect(screen.getByText(/AI to review \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Please chef further check these ingredients/i)).toBeInTheDocument();
  });
});
