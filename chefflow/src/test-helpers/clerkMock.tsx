import type { ReactNode } from 'react';
import { vi } from 'vitest';

/**
 * Vitest factory for stubbing Clerk hooks/components in component tests.
 * Tests that don't care about auth get a signed-in user by default;
 * tests that need the signed-out flow can call clerkMockSignedOut().
 *
 * Usage:
 *   vi.mock('@clerk/clerk-react', () => clerkMockSignedIn('user_test_abc'));
 *   // or
 *   vi.mock('@clerk/clerk-react', () => clerkMockSignedOut());
 */
export function clerkMockSignedIn(userId = 'user_test_abc') {
  return {
    ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
    SignedOut: () => null,
    SignIn: () => <div data-testid="clerk-signin" />,
    UserButton: () => <button type="button" aria-label="User menu">U</button>,
    useUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: userId } }),
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: true,
      userId,
      getToken: vi.fn(async () => 'fake.jwt.token'),
    }),
  };
}

export function clerkMockSignedOut() {
  return {
    ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    SignedIn: () => null,
    SignedOut: ({ children }: { children: ReactNode }) => <>{children}</>,
    SignIn: () => <div data-testid="clerk-signin" />,
    UserButton: () => null,
    useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: vi.fn(async () => null),
    }),
  };
}
