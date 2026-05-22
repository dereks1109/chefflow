import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthGate } from './useAuthGate';
import { useAuthGateStore } from './useAuthGateStore';

// Mock Clerk hooks. The mock state is mutated by the test before each
// invocation so we can flip signed-in/signed-out without remounting.
const clerkState = { isSignedIn: false };
const openSignInMock = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: clerkState.isSignedIn }),
  useClerk: () => ({ openSignIn: openSignInMock }),
}));

beforeEach(() => {
  clerkState.isSignedIn = false;
  openSignInMock.mockClear();
  useAuthGateStore.setState({ pendingAction: null });
});

describe('useAuthGate', () => {
  it('calls the action immediately when the user is already signed in — gated buttons must feel instant', () => {
    clerkState.isSignedIn = true;
    const action = vi.fn();
    const { result } = renderHook(() => useAuthGate());

    act(() => result.current(action));

    expect(action).toHaveBeenCalledTimes(1);
    expect(openSignInMock).not.toHaveBeenCalled();
    expect(useAuthGateStore.getState().pendingAction).toBeNull();
  });

  it('queues the action and opens Clerk modal when signed-out — no silent 401 reaches the worker', () => {
    clerkState.isSignedIn = false;
    const action = vi.fn();
    const { result } = renderHook(() => useAuthGate());

    act(() => result.current(action));

    expect(action).not.toHaveBeenCalled();
    expect(openSignInMock).toHaveBeenCalledTimes(1);
    expect(useAuthGateStore.getState().pendingAction).toBe(action);
  });

  it('only the latest queued action survives — a second gated click replaces the first', () => {
    clerkState.isSignedIn = false;
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    const { result } = renderHook(() => useAuthGate());

    act(() => result.current(firstAction));
    act(() => result.current(secondAction));

    expect(openSignInMock).toHaveBeenCalledTimes(2);
    expect(useAuthGateStore.getState().pendingAction).toBe(secondAction);
  });

  it('E2E mode bypasses the gate — the existing Playwright suite must keep working without Clerk', () => {
    // Force the VITE_E2E_MODE flag via import.meta.env. Vitest exposes it
    // on import.meta.env directly; we mutate at runtime for this spec.
    (import.meta.env as Record<string, string>).VITE_E2E_MODE = 'true';
    clerkState.isSignedIn = false;
    const action = vi.fn();
    try {
      const { result } = renderHook(() => useAuthGate());
      act(() => result.current(action));
      expect(action).toHaveBeenCalledTimes(1);
      expect(openSignInMock).not.toHaveBeenCalled();
    } finally {
      delete (import.meta.env as Record<string, string | undefined>).VITE_E2E_MODE;
    }
  });
});
