import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MobileTopBar from './MobileTopBar';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

const clerkState = vi.hoisted(() => ({
  isSignedIn: true,
  openSignIn: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  UserButton: () => <button data-testid="clerk-user-button">Account</button>,
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
  clerkState.isSignedIn = true;
  clerkState.openSignIn.mockReset();
});

describe('MobileTopBar', () => {
  it('renders the About text link', () => {
    renderBar();
    expect(screen.getByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about');
  });

  it('does not render a Plans CTA', () => {
    renderBar();
    expect(screen.queryByTestId('nav-plans-cta')).toBeNull();
    expect(screen.queryByRole('link', { name: /^plans$/i })).toBeNull();
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

  it('shows the signed-in avatar when the user is signed in', () => {
    clerkState.isSignedIn = true;
    renderBar();
    expect(screen.getByTestId('mobile-account-avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-sign-in')).toBeNull();
  });

  it('shows a grey guest avatar in place of a Sign-in button when signed out', () => {
    clerkState.isSignedIn = false;
    renderBar();
    expect(screen.getByTestId('mobile-sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('account-avatar-guest')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-account-avatar')).toBeNull();
  });

  it('clicking the guest avatar opens the Clerk sign-in modal', async () => {
    clerkState.isSignedIn = false;
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByTestId('mobile-sign-in'));
    expect(clerkState.openSignIn).toHaveBeenCalledTimes(1);
  });
});
