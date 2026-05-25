import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TopNav from './TopNav';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

// Hoisted mock state so the @clerk/clerk-react mock + each test can mutate it.
const clerkState = vi.hoisted(() => ({
  isSignedIn: true,
  openSignIn: vi.fn(),
}));

// UserButton is a Clerk component — stub it out.
vi.mock('@clerk/clerk-react', () => ({
  UserButton: () => <button data-testid="clerk-user-button">Account</button>,
  useUser: () => ({ isSignedIn: clerkState.isSignedIn }),
  useClerk: () => ({ openSignIn: clerkState.openSignIn }),
}));

// UsageMeter hits the worker — stub it.
vi.mock('../components/UsageMeter', () => ({
  default: () => <div data-testid="usage-meter-stub" />,
}));

// BrandLogo renders an icon + text — a text stub is sufficient.
vi.mock('../components/BrandLogo', () => ({
  default: ({ className }: { className?: string }) => (
    <span className={className}>ChefFlow</span>
  ),
}));

function renderNav(initialEntries: string[] = ['/recipes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TopNav />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useTierStore.setState({ tier: 'free' });
  useUpgradeSheetStore.setState({ open: false, reason: null });
  clerkState.isSignedIn = true;
  clerkState.openSignIn.mockReset();
});

describe('TopNav', () => {
  it('renders the About nav link first among primary nav items', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const links = nav.querySelectorAll('a');
    // About is the first item in the navItems array
    expect(links[0]).toHaveAttribute('href', '/about');
  });

  it('renders Recipes, Events, Workflows, and Community nav links', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /recipes/i })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: /events/i })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: /workflows/i })).toHaveAttribute('href', '/workflows');
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
  });

  it('does not render a Plans CTA', () => {
    renderNav();
    expect(screen.queryByTestId('nav-plans-cta')).toBeNull();
    expect(screen.queryByRole('link', { name: /^plans$/i })).toBeNull();
  });

  it('renders a Community nav link pointing to /community', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
  });

  it('renders the Settings gear link with aria-label', () => {
    renderNav();
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('does not render a Search button or command palette trigger', () => {
    renderNav();
    // No button with "search" or "cmd" text should exist in the nav
    expect(screen.queryByRole('button', { name: /search/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cmd/i })).toBeNull();
  });

  it('does not render a ThemeToggle in the nav', () => {
    renderNav();
    // ThemeToggle renders a button with "switch to ... mode" — should be absent
    expect(
      screen.queryByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeNull();
  });

  it('shows the Upgrade button for free users', () => {
    renderNav();
    expect(screen.getByTestId('nav-upgrade-button')).toBeInTheDocument();
  });

  it('hides the Upgrade button for pro users', () => {
    useTierStore.setState({ tier: 'pro' });
    renderNav();
    expect(screen.queryByTestId('nav-upgrade-button')).toBeNull();
  });

  it('clicking the Upgrade button opens the UpgradeSheet with reason=general', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByTestId('nav-upgrade-button'));
    expect(useUpgradeSheetStore.getState().open).toBe(true);
    expect(useUpgradeSheetStore.getState().reason).toBe('general');
  });

  it('shows the signed-in avatar (initials/photo) when the user is signed in', () => {
    clerkState.isSignedIn = true;
    renderNav();
    expect(screen.getByTestId('topnav-account-avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('topnav-sign-in')).toBeNull();
  });

  it('shows a grey guest avatar in place of a Sign-in button when signed out', () => {
    clerkState.isSignedIn = false;
    renderNav();
    expect(screen.getByTestId('topnav-sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('account-avatar-guest')).toBeInTheDocument();
    expect(screen.queryByTestId('topnav-account-avatar')).toBeNull();
  });

  it('clicking the guest avatar opens the Clerk sign-in modal', async () => {
    clerkState.isSignedIn = false;
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByTestId('topnav-sign-in'));
    expect(clerkState.openSignIn).toHaveBeenCalledTimes(1);
  });
});
