import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SideNav from './SideNav';
import { useTierStore } from '../../state/useTierStore';
import { useAdminStore } from '../../state/useAdminStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

// T8 — SideNav is the consolidated single-source-of-truth for the
// chef's primary nav. These specs pin the tier-gates + drawer-close
// contract that the old TopNav / MobileTopBar / BottomNav split
// previously fragmented across three files.

const clerkState = vi.hoisted(() => ({
  isSignedIn: true,
  openSignIn: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: clerkState.isSignedIn }),
  useClerk: () => ({ openSignIn: clerkState.openSignIn }),
}));

vi.mock('../components/UsageMeter', () => ({
  default: () => <div data-testid="usage-meter-stub" />,
}));

vi.mock('../components/BrandLogo', () => ({
  default: ({ className }: { className?: string }) => (
    <span className={className}>ChefFlow</span>
  ),
}));

function renderNav(opts: { initialEntries?: string[]; onNavigate?: () => void } = {}) {
  const { initialEntries = ['/recipes'], onNavigate } = opts;
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SideNav onNavigate={onNavigate} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTierStore.setState({ tier: 'free' });
  useAdminStore.setState({ isAdmin: false });
  useUpgradeSheetStore.setState({ open: false, reason: null });
  clerkState.isSignedIn = true;
  clerkState.openSignIn.mockReset();
});

describe('SideNav (T8)', () => {
  it('renders the five base primary nav items', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /recipes/i })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: /events/i })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: /workflows/i })).toHaveAttribute('href', '/workflows');
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/contact');
  });

  it('hides the Teams link for non-Enterprise tiers', () => {
    renderNav();
    expect(screen.queryByRole('link', { name: /^teams$/i })).toBeNull();
  });

  it('shows the Teams link for Enterprise chefs (T5 gate preserved)', () => {
    useTierStore.setState({ tier: 'enterprise' });
    renderNav();
    expect(screen.getByRole('link', { name: /^teams$/i })).toHaveAttribute('href', '/teams');
  });

  it('hides the Admin link when isAdmin is false', () => {
    renderNav();
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
  });

  it('shows the Admin link when isAdmin is true', () => {
    useAdminStore.setState({ isAdmin: true });
    renderNav();
    expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin');
  });

  it('renders the Settings + Account links in the footer block', () => {
    renderNav();
    const settings = screen.getByRole('link', { name: /settings/i });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('sidenav-account-avatar')).toHaveAttribute('href', '/settings');
  });

  it('shows the guest sign-in trigger when signed out', () => {
    clerkState.isSignedIn = false;
    renderNav();
    expect(screen.getByTestId('sidenav-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('sidenav-account-avatar')).toBeNull();
  });

  it('clicking the guest sign-in trigger opens the Clerk sign-in modal', async () => {
    clerkState.isSignedIn = false;
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByTestId('sidenav-sign-in'));
    expect(clerkState.openSignIn).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigate whenever a primary nav link is clicked (so the mobile drawer can close itself)', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderNav({ onNavigate });
    await user.click(screen.getByRole('link', { name: /events/i }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('renders the Upgrade button (kept visible across tiers — relabels for Pro / Enterprise)', () => {
    renderNav();
    expect(screen.getByTestId('nav-upgrade-button')).toBeInTheDocument();
  });
});
