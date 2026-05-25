import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import OnboardingGate from './OnboardingGate';

const userState = vi.hoisted(() => ({
  current: {
    isLoaded: true,
    user: null as null | {
      id: string;
      publicMetadata: Record<string, unknown>;
      reload?: () => Promise<unknown>;
    },
  },
}));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => userState.current,
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

// The sheet calls completeOnboarding internally; we don't exercise it here.
vi.mock('../../core/onboarding/onboardingClient', () => ({
  completeOnboarding: vi.fn(async () => ({ ok: true })),
}));

beforeEach(() => {
  userState.current = { isLoaded: true, user: null };
});

afterEach(() => {
  cleanup();
});

describe('OnboardingGate', () => {
  it('renders nothing while Clerk is still loading', () => {
    userState.current = { isLoaded: false, user: null };
    render(
      <OnboardingGate>
        <div data-testid="children">app</div>
      </OnboardingGate>,
    );
    expect(screen.queryByTestId('children')).toBeNull();
    expect(screen.queryByTestId('onboarding-sheet')).toBeNull();
  });

  it('passes children through when signed out (signed-out UX is handled elsewhere)', () => {
    userState.current = { isLoaded: true, user: null };
    render(
      <OnboardingGate>
        <div data-testid="children">app</div>
      </OnboardingGate>,
    );
    expect(screen.getByTestId('children')).toBeTruthy();
  });

  it('renders the sheet (and hides children) when user.publicMetadata.onboardingComplete is falsy', () => {
    userState.current = {
      isLoaded: true,
      user: { id: 'user_alice', publicMetadata: {} },
    };
    render(
      <OnboardingGate>
        <div data-testid="children">app</div>
      </OnboardingGate>,
    );
    expect(screen.getByTestId('onboarding-sheet')).toBeTruthy();
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('renders children (no sheet) when publicMetadata.onboardingComplete === true', () => {
    userState.current = {
      isLoaded: true,
      user: { id: 'user_alice', publicMetadata: { onboardingComplete: true } },
    };
    render(
      <OnboardingGate>
        <div data-testid="children">app</div>
      </OnboardingGate>,
    );
    expect(screen.queryByTestId('onboarding-sheet')).toBeNull();
    expect(screen.getByTestId('children')).toBeTruthy();
  });
});
