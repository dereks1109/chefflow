import { create } from 'zustand';
import { TIER_LIMITS, type Tier, type TierLimits } from '../core/tier/limits';

// ---------------------------------------------------------------------------
// useTierStore — the React surface for "which tier is the current user on".
//
// Single source of truth used by `<TierGate>`, the usage meter, and any
// future feature toggle. Mirrored from Clerk's `user.publicMetadata.tier`
// by the `<TierSync />` component mounted inside `<SignedIn>`. Until that
// component dispatches, the store sits at its default — see `defaultTier`
// below.
//
// Pattern (not a hook calling `useUser()`) chosen so the store is callable
// outside a `ClerkProvider` — the E2E mode in `main.tsx` mounts the app
// without Clerk wrapping it.
// ---------------------------------------------------------------------------

interface TierState {
  tier: Tier;
  limits: TierLimits;
  setTier: (next: Tier) => void;
}

/**
 * Default tier at app boot.
 * - E2E mode (Playwright) unlocks Business so specs can exercise gated
 *   features without going through Clerk metadata.
 * - Real users start at Free and get bumped by `<TierSync />` once Clerk
 *   reports publicMetadata.tier.
 */
function defaultTier(): Tier {
  const isE2E =
    typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_E2E_MODE as string | undefined) === 'true';
  return isE2E ? 'business' : 'free';
}

const initialTier = defaultTier();

export const useTierStore = create<TierState>((set) => ({
  tier: initialTier,
  limits: TIER_LIMITS[initialTier],
  setTier: (next) => set({ tier: next, limits: TIER_LIMITS[next] }),
}));
