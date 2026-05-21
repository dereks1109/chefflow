// Mirror of chefflow/src/core/tier/limits.ts. MUST stay in sync — the SPA
// and the worker independently enforce the same limits; drift means bugs.
// Kept minimal here (only the fields the worker actually needs).

export type Tier = 'free' | 'pro' | 'business';

export const UNLIMITED = -1 as const;

export interface TierLimits {
  maxRecipesPerDay: number;
  maxEventsPerDay: number;
  maxLlmCallsPerDay: number;
  maxSeats: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxRecipesPerDay: 5,
    maxEventsPerDay: 1,
    maxLlmCallsPerDay: 10,
    maxSeats: 1,
  },
  pro: {
    maxRecipesPerDay: UNLIMITED,
    maxEventsPerDay: UNLIMITED,
    maxLlmCallsPerDay: 50,
    maxSeats: 1,
  },
  business: {
    maxRecipesPerDay: UNLIMITED,
    maxEventsPerDay: UNLIMITED,
    maxLlmCallsPerDay: UNLIMITED,
    maxSeats: 5,
  },
};

export function parseTier(raw: unknown): Tier {
  if (raw === 'pro' || raw === 'business' || raw === 'free') return raw;
  return 'free';
}
