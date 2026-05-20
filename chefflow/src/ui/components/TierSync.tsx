import { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import { parseTier } from '../../core/tier/limits';

/**
 * Bridges Clerk's `user.publicMetadata.tier` into `useTierStore`.
 *
 * Renders nothing. Mount once inside `<SignedIn>` so it's only active in
 * the Clerk-wrapped tree — E2E mode (`UngatedApp`) does NOT mount it and
 * relies on the store's default `business` tier.
 *
 * Tier is set by the Stripe webhook (when shipped) writing back to Clerk
 * via the Backend API. Until then, flip metadata manually in the Clerk
 * dashboard to test.
 */
export default function TierSync() {
  const { user } = useUser();
  const setTier = useTierStore((s) => s.setTier);

  useEffect(() => {
    const raw = user?.publicMetadata?.tier;
    setTier(parseTier(raw));
  }, [user, setTier]);

  return null;
}
