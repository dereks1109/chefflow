// ---------------------------------------------------------------------------
// Subscription tier definitions — single source of truth for what each
// tier allows, how much it costs, and what the user sees.
//
// Limits are checked at use sites via `isUnderLimit()` / `hasFeature()`.
// Tier upgrades flip a Clerk publicMetadata.tier field; the
// `useTierStore` Zustand store mirrors that into React state via the
// `TierSync` component mounted inside `<SignedIn>`.
//
// Lives in `chefflow/src/core/tier/` (parallel to `core/recipes/`,
// `core/events/`, etc.) so domain logic can import the same constants
// the UI does. See the business model plan at
// /Users/derekshek/.claude/plans/giggly-marinating-spindle.md
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro' | 'business';

export const TIER_ORDER: readonly Tier[] = ['free', 'pro', 'business'] as const;

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  business: 2,
};

export interface TierLimits {
  /** -1 means unlimited; non-negative ints are hard caps. */
  maxRecipes: number;
  maxActiveEvents: number;
  maxLlmCallsPerMonth: number;
  /** -1 means unlimited; otherwise a chef-seat count. */
  maxSeats: number;
  hasPlacesAutocomplete: boolean;
  hasWorkflowScheduler: boolean;
}

export const UNLIMITED = -1 as const;

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxRecipes: 5,
    maxActiveEvents: 1,
    maxLlmCallsPerMonth: 10,
    maxSeats: 1,
    hasPlacesAutocomplete: false,
    hasWorkflowScheduler: false,
  },
  pro: {
    maxRecipes: UNLIMITED,
    maxActiveEvents: UNLIMITED,
    maxLlmCallsPerMonth: 100,
    maxSeats: 1,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
  business: {
    maxRecipes: UNLIMITED,
    maxActiveEvents: UNLIMITED,
    maxLlmCallsPerMonth: 500,
    maxSeats: 5,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
};

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
};

/** GBP, integers — see the business model plan for justification. */
export const TIER_PRICE_GBP: Record<Tier, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 12, annual: 108 },
  business: { monthly: 39, annual: 390 },
};

/** True when `current < TIER_LIMITS[tier][key]` or the limit is UNLIMITED. */
export function isUnderLimit(
  tier: Tier,
  key: 'maxRecipes' | 'maxActiveEvents' | 'maxLlmCallsPerMonth' | 'maxSeats',
  current: number,
): boolean {
  const max = TIER_LIMITS[tier][key];
  return max === UNLIMITED || current < max;
}

export function hasFeature(
  tier: Tier,
  feature: 'hasPlacesAutocomplete' | 'hasWorkflowScheduler',
): boolean {
  return TIER_LIMITS[tier][feature];
}

/** True when `actual` is at least as privileged as `required`. */
export function meetsTier(actual: Tier, required: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

/** Coerce an unknown string (e.g. from Clerk publicMetadata) to a valid Tier. */
export function parseTier(raw: unknown): Tier {
  if (raw === 'pro' || raw === 'business' || raw === 'free') return raw;
  return 'free';
}
