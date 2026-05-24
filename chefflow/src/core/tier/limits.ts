// ---------------------------------------------------------------------------
// Subscription tier definitions — the SINGLE SOURCE OF TRUTH for what each
// tier allows, how much it costs, and what the user sees.
//
// SHARED BETWEEN APPS. The Cloudflare Worker at chefflow-worker/ imports
// from this same file (via a relative `../../chefflow/src/core/tier/limits`
// path) so SPA quotas and worker-enforced caps stay in lockstep. Drift here
// is a billing-correctness bug — never duplicate this content elsewhere.
//
// Limits are checked at use sites via `isUnderLimit()` / `hasFeature()`.
// Tier upgrades flip a Clerk publicMetadata.tier field; the
// `useTierStore` Zustand store mirrors that into React state via the
// `TierSync` component mounted inside `<SignedIn>`.
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'pro' | 'business' | 'enterprise';

// Order is also the upgrade ramp: free < pro < business < enterprise. The
// `business` tier is retained for backward-compat with historical Stripe
// subscriptions; new product surfaces present Free / Pro / Enterprise.
export const TIER_ORDER: readonly Tier[] = ['free', 'pro', 'business', 'enterprise'] as const;

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export interface TierLimits {
  /**
   * Per-UTC-day creation rate limit. -1 means unlimited. Existing data
   * never counts against this cap — it's a rate on NEW creates today,
   * not a total. Resets at UTC midnight via the chefflow-worker KV counter.
   */
  maxRecipesPerDay: number;
  maxEventsPerDay: number;
  maxLlmCallsPerDay: number;
  /** -1 means unlimited; otherwise a chef-seat count. */
  maxSeats: number;
  hasPlacesAutocomplete: boolean;
  hasWorkflowScheduler: boolean;
}

export const UNLIMITED = -1 as const;

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxRecipesPerDay: 5,
    maxEventsPerDay: 1,
    maxLlmCallsPerDay: 10,
    maxSeats: 1,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
  pro: {
    maxRecipesPerDay: UNLIMITED,
    maxEventsPerDay: UNLIMITED,
    maxLlmCallsPerDay: 50,
    maxSeats: 1,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
  business: {
    maxRecipesPerDay: UNLIMITED,
    maxEventsPerDay: UNLIMITED,
    maxLlmCallsPerDay: UNLIMITED,
    maxSeats: 5,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
  // Enterprise: hotels + large banquet restaurants. No daily caps anywhere,
  // generous seat allowance for back-of-house teams, and the same feature
  // surface as business — priority support is a service commitment tracked
  // outside this object.
  enterprise: {
    maxRecipesPerDay: UNLIMITED,
    maxEventsPerDay: UNLIMITED,
    maxLlmCallsPerDay: UNLIMITED,
    maxSeats: 50,
    hasPlacesAutocomplete: true,
    hasWorkflowScheduler: true,
  },
};

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

/** GBP, integers — see the business model plan for justification. */
export const TIER_PRICE_GBP: Record<Tier, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  // Pro: bumped from £12→£15 (annual £108→£135) to reflect new positioning
  // toward private chefs + small bistros. Existing £12 subscribers stay on
  // their old Stripe price until they cancel + resubscribe.
  pro: { monthly: 15, annual: 135 },
  business: { monthly: 39, annual: 390 },
  // Enterprise: same 25% annual discount as Pro (£50/mo → £450/yr).
  enterprise: { monthly: 50, annual: 450 },
};

/** True when `current < TIER_LIMITS[tier][key]` or the limit is UNLIMITED. */
export function isUnderLimit(
  tier: Tier,
  key: 'maxRecipesPerDay' | 'maxEventsPerDay' | 'maxLlmCallsPerDay' | 'maxSeats',
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
  if (raw === 'pro' || raw === 'business' || raw === 'free' || raw === 'enterprise') return raw;
  return 'free';
}
