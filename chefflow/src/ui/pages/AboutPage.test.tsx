import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';

const openWith = vi.fn();

vi.mock('../../state/useUpgradeSheetStore', () => ({
  useUpgradeSheetStore: {
    getState: () => ({ openWith }),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );
}

describe('AboutPage', () => {
  it('renders the hero heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /chefflow.*plan.*prep.*serve/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Built For" section heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /built for/i }),
    ).toBeInTheDocument();
  });

  it('renders all three "Built For" cards', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 3, name: /private chefs/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /supper clubs/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /small caterers/i })).toBeInTheDocument();
  });

  it('renders the "What ChefFlow Does" section heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /what chefflow does/i }),
    ).toBeInTheDocument();
  });

  it('renders flow diagram with all three steps and accessible list label', () => {
    renderPage();
    const flowList = screen.getByRole('list', { name: /chefflow three-step workflow/i });
    expect(flowList).toBeInTheDocument();
    expect(screen.getByText('Recipe Library')).toBeInTheDocument();
    expect(screen.getByText('Event Planning')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Workflows')).toBeInTheDocument();
  });

  it('renders the "Simple Pricing" section heading and both plans', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /simple pricing/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /free tier/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /pro tier/i })).toBeInTheDocument();
  });

  it('Simple Pricing section has id="pricing" for hash deep-linking', () => {
    renderPage();
    const pricingSection = screen.getByRole('region', { name: /simple pricing/i });
    expect(pricingSection).toHaveAttribute('id', 'pricing');
  });

  it('"Start Free Now" link points to /recipes', () => {
    renderPage();
    const startLink = screen.getByRole('link', { name: /start free now/i });
    expect(startLink).toBeInTheDocument();
    expect(startLink).toHaveAttribute('href', '/recipes');
  });

  it('"Upgrade to Pro" button calls openWith("general")', () => {
    renderPage();
    const upgradeBtn = screen.getByRole('button', { name: /upgrade to pro/i });
    expect(upgradeBtn).toBeInTheDocument();
    fireEvent.click(upgradeBtn);
    expect(openWith).toHaveBeenCalledWith('general');
  });

  it('hero section is labelled for accessibility', () => {
    renderPage();
    const heroSection = screen.getByRole('region', { name: /chefflow.*plan.*prep.*serve/i });
    expect(heroSection).toBeInTheDocument();
  });

  it('renders feature section headings for recipe library, event planning, and kitchen workflows', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: /smart recipe library/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /seamless event planning/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /automated kitchen workflows/i }),
    ).toBeInTheDocument();
  });

  it('renders Legal section with all three links pointing to correct routes', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /legal/i })).toBeInTheDocument();
    const disclaimer = screen.getByRole('link', { name: /disclaimer/i });
    const privacy = screen.getByRole('link', { name: /privacy policy/i });
    const terms = screen.getByRole('link', { name: /terms & conditions/i });
    expect(disclaimer).toHaveAttribute('href', '/disclaimer');
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(terms).toHaveAttribute('href', '/terms');
  });
});
