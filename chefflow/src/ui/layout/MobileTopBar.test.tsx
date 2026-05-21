import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileTopBar from './MobileTopBar';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

vi.mock('@clerk/clerk-react', () => ({
  UserButton: () => <button data-testid="clerk-user-button">Account</button>,
}));

vi.mock('../components/UsageMeter', () => ({
  default: () => <div data-testid="usage-meter-stub" />,
}));

vi.mock('../components/Logo', () => ({
  default: ({ className }: { className?: string }) => (
    <span className={className}>ChefFlow</span>
  ),
}));

function renderBar(initialEntries: string[] = ['/recipes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MobileTopBar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useTierStore.setState({ tier: 'free' });
  useUpgradeSheetStore.setState({ open: false, reason: null });
});

describe('MobileTopBar', () => {
  it('renders the About text link', () => {
    renderBar();
    expect(screen.getByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about');
  });

  it('renders the Plans CTA pointing to /about#pricing', () => {
    renderBar();
    const link = screen.getByRole('link', { name: /^plans$/i });
    expect(link).toHaveAttribute('href', '/about#pricing');
    expect(link).toHaveAttribute('data-testid', 'nav-plans-cta');
    expect(link.className).toContain('btn-primary');
  });

  it('renders exactly one Plans link', () => {
    renderBar();
    expect(screen.getAllByRole('link', { name: /^plans$/i })).toHaveLength(1);
  });

  it('does not render a Community link', () => {
    renderBar();
    expect(screen.queryByRole('link', { name: /community/i })).toBeNull();
  });

  it('renders the Settings gear link with aria-label', () => {
    renderBar();
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('does not render a Search button or command palette trigger', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /search/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cmd/i })).toBeNull();
  });

  it('does not render a ThemeToggle in the bar', () => {
    renderBar();
    expect(
      screen.queryByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeNull();
  });

  it('shows the Upgrade button for free users', () => {
    renderBar();
    expect(screen.getByTestId('nav-upgrade-button')).toBeInTheDocument();
  });

  it('hides the Upgrade button for pro users', () => {
    useTierStore.setState({ tier: 'pro' });
    renderBar();
    expect(screen.queryByTestId('nav-upgrade-button')).toBeNull();
  });
});
