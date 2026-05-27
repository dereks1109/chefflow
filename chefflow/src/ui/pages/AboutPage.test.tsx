import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

beforeEach(() => {
  useUpgradeSheetStore.setState({ open: false, reason: null });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );
}

describe('AboutPage', () => {
  it('renders the hero heading with the Plan/Prep/Serve tagline', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /plan.*prep.*serve/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Built for" section listing private chefs + small bistros + hotels', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /built for/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /private chefs/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /small bistros/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /hotels/i })).toBeInTheDocument();
  });

  it('renders the three selling points — reliability, audit, scheduler', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 3, name: /kitchen-grade reliability/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /audit/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /scheduler/i })).toBeInTheDocument();
  });

  it('renders the Pricing section with three tiers (Free, Pro, Enterprise)', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /^pricing$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^free$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^pro$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^enterprise$/i })).toBeInTheDocument();
  });

  it('Pricing section has id="pricing" for /about#pricing deep-linking', () => {
    renderPage();
    const pricingSection = screen.getByRole('region', { name: /^pricing$/i });
    expect(pricingSection).toHaveAttribute('id', 'pricing');
  });

  it('"Open the kitchen" link points to /recipes', () => {
    renderPage();
    const startLink = screen.getByRole('link', { name: /open the kitchen/i });
    expect(startLink).toHaveAttribute('href', '/recipes');
  });

  it('Upgrade to Pro CTA flips the UpgradeSheet store to open with reason=general', () => {
    renderPage();
    const upgradeBtn = screen.getByTestId('about-cta-pro');
    fireEvent.click(upgradeBtn);
    expect(useUpgradeSheetStore.getState().open).toBe(true);
    expect(useUpgradeSheetStore.getState().reason).toBe('general');
  });

  it('Upgrade to Enterprise CTA also flips the store open — separate target audience', () => {
    renderPage();
    const upgradeBtn = screen.getByTestId('about-cta-enterprise');
    fireEvent.click(upgradeBtn);
    expect(useUpgradeSheetStore.getState().open).toBe(true);
  });

  it('renders the trust + contact note with the support email link', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /a note on trust/i })).toBeInTheDocument();
    const email = screen.getByRole('link', { name: /admin@chefflow\.uk/i });
    expect(email).toHaveAttribute('href', expect.stringContaining('mailto:admin@chefflow.uk'));
  });
});
