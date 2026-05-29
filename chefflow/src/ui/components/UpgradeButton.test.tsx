import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Per-test override of @clerk/clerk-react's useUser to flip signed-in
// state. The default mock in vitest.setup returns signed-in; explicit
// override for guest scenarios.
const useUserMock = vi.hoisted(() => vi.fn(() => ({
  isSignedIn: true,
  isLoaded: true,
  user: null,
})));
vi.mock('@clerk/clerk-react', () => ({
  useUser: useUserMock,
}));

import UpgradeButton from './UpgradeButton';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

beforeEach(() => {
  // Reset stores between tests so tier set by one test doesn't bleed.
  useTierStore.getState().setTier('free');
  useUpgradeSheetStore.getState().close();
  useUserMock.mockReturnValue({ isSignedIn: true, isLoaded: true, user: null });
});

describe('UpgradeButton', () => {
  it('renders nothing for guests (signed-out, non-E2E)', () => {
    useUserMock.mockReturnValue({ isSignedIn: false, isLoaded: true, user: null });
    const { container } = render(<UpgradeButton />);
    expect(container.firstChild).toBeNull();
  });

  it('Free chef → button label "Upgrade", aria-label "Upgrade to Pro"', () => {
    useTierStore.getState().setTier('free');
    render(<UpgradeButton />);
    const btn = screen.getByTestId('nav-upgrade-button');
    expect(btn.textContent).toContain('Upgrade');
    expect(btn.textContent).not.toContain('Enterprise');
    expect(btn.getAttribute('aria-label')).toBe('Upgrade to Pro');
  });

  it('Pro chef → button label "Upgrade to Enterprise"', () => {
    useTierStore.getState().setTier('pro');
    render(<UpgradeButton />);
    const btn = screen.getByTestId('nav-upgrade-button');
    expect(btn.textContent).toContain('Upgrade to Enterprise');
    expect(btn.getAttribute('aria-label')).toBe('Upgrade to Enterprise');
  });

  it('Enterprise chef → button label "Manage plan", aria-label "Manage your subscription"', () => {
    useTierStore.getState().setTier('enterprise');
    render(<UpgradeButton />);
    const btn = screen.getByTestId('nav-upgrade-button');
    expect(btn.textContent).toContain('Manage plan');
    expect(btn.textContent).not.toContain('Upgrade');
    expect(btn.getAttribute('aria-label')).toBe('Manage your subscription');
  });

  it('clicking the button opens the UpgradeSheet with reason="general"', () => {
    useTierStore.getState().setTier('free');
    render(<UpgradeButton />);
    expect(useUpgradeSheetStore.getState().open).toBe(false);
    fireEvent.click(screen.getByTestId('nav-upgrade-button'));
    const state = useUpgradeSheetStore.getState();
    expect(state.open).toBe(true);
    expect(state.reason).toBe('general');
  });
});
