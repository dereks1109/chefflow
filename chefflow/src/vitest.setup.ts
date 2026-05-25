import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import type { ReactNode } from 'react';

// Global Clerk mock — every test file gets a stub that reports the user
// as signed in. The public-by-default refactor sprinkled `useUser` /
// `useClerk` calls throughout the app via the new useAuthGate hook;
// tests that previously didn't need ClerkProvider keep working with this
// default. Files that need to test the signed-out branch override
// locally with their own `vi.mock`.
// `user` is null by default — most existing tests don't care about identity.
// The OnboardingGate special-cases `user === null` to pass through (signed-
// out path is handled by SignInGate at the outer layer). Tests that need a
// signed-in user explicitly override this mock locally.
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: true, isLoaded: true, user: null }),
  useAuth: () => ({ getToken: async () => 'test-token', isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ openSignIn: () => {} }),
  UserButton: () => null,
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: () => null,
  SignIn: () => null,
}));
