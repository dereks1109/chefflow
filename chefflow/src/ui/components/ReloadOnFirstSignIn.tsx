import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

// One-shot hard refresh on the moment a user signs in. The chef has hit
// cases where freshly-pulled demo rows + tier metadata don't render until
// a manual refresh — this makes the post-sign-in state deterministic.
//
// Idempotency: a sessionStorage flag keyed on userId prevents a reload
// loop. Same user signing out + back in inside the same tab does NOT
// trigger again. A different userId DOES (the flag is per-user).
//
// E2E + SSR safety: skipped under VITE_E2E_MODE (Playwright would hit a
// reload loop fighting against the test harness) and when `window` is
// undefined (no-op for any future SSR build).

const FLAG_PREFIX = 'chefflow:reloaded-for-user:';

export default function ReloadOnFirstSignIn() {
  const { isSignedIn, user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user?.id) return;
    if ((import.meta.env.VITE_E2E_MODE as string | undefined) === 'true') return;
    if (typeof window === 'undefined') return;

    const flagKey = `${FLAG_PREFIX}${user.id}`;
    if (window.sessionStorage.getItem(flagKey)) return;
    window.sessionStorage.setItem(flagKey, '1');
    window.location.reload();
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
