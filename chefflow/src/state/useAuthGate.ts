import { useUser, useClerk } from '@clerk/clerk-react';
import { useAuthGateStore } from './useAuthGateStore';

// useAuthGate — gate any write action behind Clerk auth.
//
// Usage:
//   const requireAuth = useAuthGate();
//   onClick={() => requireAuth(() => doCreate())}
//
// Signed-in user → action fires immediately. Signed-out user → action is
// queued and the Clerk sign-in modal opens. Once Clerk reports the user is
// signed in (AuthGateRunner watches), the queued action fires automatically.
//
// E2E mode short-circuits to always-signed-in so the existing test suite
// keeps working without Clerk in the loop.
export function useAuthGate(): (action: () => void) => void {
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const setPendingAction = useAuthGateStore((s) => s.setPendingAction);
  const e2eMode = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';

  return function requireAuth(action: () => void) {
    if (isSignedIn || e2eMode) {
      action();
      return;
    }
    setPendingAction(action);
    // openSignIn pops Clerk's hosted modal over the current page. No URL
    // change, so the chef stays on whatever route triggered the gate.
    clerk.openSignIn?.();
  };
}
