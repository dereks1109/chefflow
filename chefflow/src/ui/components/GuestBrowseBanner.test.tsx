import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const openSignInMock = vi.hoisted(() => vi.fn());
vi.mock('@clerk/clerk-react', () => ({
  useClerk: () => ({ openSignIn: openSignInMock }),
}));

import GuestBrowseBanner from './GuestBrowseBanner';

describe('GuestBrowseBanner', () => {
  it('renders a recipes-flavoured message + Sign-in CTA by default', () => {
    render(<GuestBrowseBanner />);
    expect(screen.getByTestId('guest-browse-banner')).toBeTruthy();
    expect(screen.getByTestId('guest-browse-banner').textContent).toMatch(/demo recipes/i);
    expect(screen.getByTestId('guest-browse-banner-signin')).toBeTruthy();
  });

  it('swaps the copy for scope="events"', () => {
    render(<GuestBrowseBanner scope="events" />);
    expect(screen.getByTestId('guest-browse-banner').textContent).toMatch(/demo events/i);
  });

  it('swaps the copy for scope="community"', () => {
    render(<GuestBrowseBanner scope="community" />);
    expect(screen.getByTestId('guest-browse-banner').textContent).toMatch(/copy a recipe/i);
  });

  it('clicking the Sign in button opens the Clerk sign-in modal', () => {
    openSignInMock.mockClear();
    render(<GuestBrowseBanner />);
    fireEvent.click(screen.getByTestId('guest-browse-banner-signin'));
    expect(openSignInMock).toHaveBeenCalledTimes(1);
  });
});
