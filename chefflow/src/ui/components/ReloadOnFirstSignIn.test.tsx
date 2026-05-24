import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ReloadOnFirstSignIn from './ReloadOnFirstSignIn';

// Hoisted user-mock state so the @clerk/clerk-react mock + each test can read it.
const userState = vi.hoisted(() => ({
  current: { isLoaded: true, isSignedIn: false, user: null as null | { id: string } },
}));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => userState.current,
}));

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  userState.current = { isLoaded: true, isSignedIn: false, user: null };
});

describe('ReloadOnFirstSignIn', () => {
  it('does NOT reload when the user is signed out', () => {
    userState.current = { isLoaded: true, isSignedIn: false, user: null };
    render(<ReloadOnFirstSignIn />);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does NOT reload while Clerk is still loading', () => {
    userState.current = { isLoaded: false, isSignedIn: false, user: null };
    render(<ReloadOnFirstSignIn />);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('sets a sessionStorage flag + reloads once on first sign-in', () => {
    userState.current = { isLoaded: true, isSignedIn: true, user: { id: 'user_alice' } };
    render(<ReloadOnFirstSignIn />);
    expect(window.sessionStorage.getItem('chefflow:reloaded-for-user:user_alice')).toBe('1');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload again on a second mount with the SAME userId (flag pre-set)', () => {
    window.sessionStorage.setItem('chefflow:reloaded-for-user:user_alice', '1');
    userState.current = { isLoaded: true, isSignedIn: true, user: { id: 'user_alice' } };
    render(<ReloadOnFirstSignIn />);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('DOES reload for a different userId on the same tab — switching account should re-fetch state', () => {
    window.sessionStorage.setItem('chefflow:reloaded-for-user:user_alice', '1');
    userState.current = { isLoaded: true, isSignedIn: true, user: { id: 'user_bob' } };
    render(<ReloadOnFirstSignIn />);
    expect(window.sessionStorage.getItem('chefflow:reloaded-for-user:user_bob')).toBe('1');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
