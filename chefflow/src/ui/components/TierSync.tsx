import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import { useAdminStore } from '../../state/useAdminStore';
import { parseTier } from '../../core/tier/limits';

/**
 * Bridges Clerk's `user.publicMetadata.{tier, role}` into `useTierStore` +
 * `useAdminStore`.
 *
 * Renders nothing. Mount once inside `<SignedIn>` so it's only active in
 * the Clerk-wrapped tree — E2E mode (`UngatedApp`) does NOT mount it and
 * relies on the store defaults (tier=business, isAdmin=false).
 *
 * Tier is set by the Stripe webhook writing back to Clerk via the Backend
 * API. Role is set manually in the Clerk Dashboard (Users → Public metadata
 * → `{"role":"admin"}`) — see chefflow-worker/README.md.
 */
export default function TierSync() {
  const { user } = useUser();
  const setTier = useTierStore((s) => s.setTier);
  const setIsAdmin = useAdminStore((s) => s.setIsAdmin);

  useEffect(() => {
    const meta = user?.publicMetadata;
    setTier(parseTier(meta?.tier));
    setIsAdmin(meta?.role === 'admin');
  }, [user, setTier, setIsAdmin]);

  return null;
}
