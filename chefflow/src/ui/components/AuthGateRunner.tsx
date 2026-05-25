import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useAuthGateStore } from '../../state/useAuthGateStore';

// Top-level effect that fires the auth-gate queue when a signed-out user
// completes Clerk sign-in. Mounted once from App.tsx. Renders nothing.
//
// Pattern: a signed-out user clicks "+ Recipe" → useAuthGate stores the
// action + opens Clerk's modal → user signs in → useUser() flips
// isSignedIn → this effect dequeues + fires. The local `firedRef` ensures
// the queued action runs exactly once even if re-renders happen rapidly
// during Clerk's session-bootstrap.
export default function AuthGateRunner() {
  const { isSignedIn } = useUser();
  const pendingAction = useAuthGateStore((s) => s.pendingAction);
  const clearPendingAction = useAuthGateStore((s) => s.clearPendingAction);
  const firedRef = useRef(false);

  useEffect(() => {
    if (isSignedIn && pendingAction && !firedRef.current) {
      firedRef.current = true;
      try {
        pendingAction();
      } finally {
        clearPendingAction();
        // Reset on next microtask so a future gate-then-sign-in cycle still
        // works. (Same component instance lives for the session.)
        queueMicrotask(() => { firedRef.current = false; });
      }
    }
    // Reset the latch if the queue is emptied by other means (e.g. the
    // user closed the modal without signing in and a new action arrives).
    if (!pendingAction) {
      firedRef.current = false;
    }
  }, [isSignedIn, pendingAction, clearPendingAction]);

  return null;
}
