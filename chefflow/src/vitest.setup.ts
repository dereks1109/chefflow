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
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: true, isLoaded: true, user: null }),
  useClerk: () => ({ openSignIn: () => {} }),
  UserButton: () => null,
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: () => null,
  SignIn: () => null,
}));
