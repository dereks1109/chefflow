import { describe, it, expect } from 'vitest';
import {
  TIER_LIMITS,
  TIER_ORDER,
  TIER_PRICE_GBP,
  UNLIMITED,
  hasFeature,
  isUnderLimit,
  meetsTier,
  parseTier,
} from './limits';

describe('tier limits', () => {
  it('orders tiers from least to most privileged', () => {
    expect(TIER_ORDER).toEqual(['free', 'pro', 'business', 'enterprise']);
  });

  it('uses the prices the business model committed to (GBP)', () => {
    expect(TIER_PRICE_GBP.free.monthly).toBe(0);
    // Pro: bumped to £15/mo (£135/yr) to reflect new positioning.
    expect(TIER_PRICE_GBP.pro.monthly).toBe(15);
    expect(TIER_PRICE_GBP.pro.annual).toBe(135);
    expect(TIER_PRICE_GBP.business.monthly).toBe(39);
    expect(TIER_PRICE_GBP.business.annual).toBe(390);
    // Enterprise: hotels + large banquets. 25% annual discount.
    expect(TIER_PRICE_GBP.enterprise.monthly).toBe(50);
    expect(TIER_PRICE_GBP.enterprise.annual).toBe(450);
  });

  it('free tier rate-limits recipes to 5/day and events to 1/day', () => {
    expect(TIER_LIMITS.free.maxRecipesPerDay).toBe(5);
    expect(TIER_LIMITS.free.maxEventsPerDay).toBe(1);
    expect(TIER_LIMITS.free.maxLlmCallsPerDay).toBe(10);
  });

  it('pro tier unlocks unlimited recipe + event creation per day', () => {
    expect(TIER_LIMITS.pro.maxRecipesPerDay).toBe(UNLIMITED);
    expect(TIER_LIMITS.pro.maxEventsPerDay).toBe(UNLIMITED);
    expect(TIER_LIMITS.pro.maxLlmCallsPerDay).toBe(50);
  });

  it('business tier unlocks unlimited LLM calls + 5 seats', () => {
    expect(TIER_LIMITS.business.maxLlmCallsPerDay).toBe(UNLIMITED);
    expect(TIER_LIMITS.business.maxSeats).toBe(5);
  });
});

describe('isUnderLimit', () => {
  it('returns true when usage is below the cap', () => {
    expect(isUnderLimit('free', 'maxRecipesPerDay', 3)).toBe(true);
  });

  it('returns false when usage equals the cap (next add would exceed it)', () => {
    expect(isUnderLimit('free', 'maxRecipesPerDay', 5)).toBe(false);
  });

  it('always returns true for unlimited caps', () => {
    expect(isUnderLimit('pro', 'maxRecipesPerDay', 9999)).toBe(true);
    expect(isUnderLimit('business', 'maxEventsPerDay', 1000)).toBe(true);
  });
});

describe('hasFeature', () => {
  // V1 leaves Places + Workflow ungated — flags stay in the schema for
  // future tiers to flip. This test pins the V1 commitment.
  it('every tier has Places autocomplete + Workflow scheduler in V1', () => {
    for (const tier of ['free', 'pro', 'business'] as const) {
      expect(hasFeature(tier, 'hasPlacesAutocomplete')).toBe(true);
      expect(hasFeature(tier, 'hasWorkflowScheduler')).toBe(true);
    }
  });
});

describe('meetsTier', () => {
  it('matches when actual equals required', () => {
    expect(meetsTier('pro', 'pro')).toBe(true);
  });

  it('matches when actual exceeds required', () => {
    expect(meetsTier('business', 'pro')).toBe(true);
    expect(meetsTier('pro', 'free')).toBe(true);
  });

  it('fails when actual is lower than required', () => {
    expect(meetsTier('free', 'pro')).toBe(false);
    expect(meetsTier('pro', 'business')).toBe(false);
  });
});

describe('parseTier', () => {
  it('passes valid tier strings through', () => {
    expect(parseTier('free')).toBe('free');
    expect(parseTier('pro')).toBe('pro');
    expect(parseTier('business')).toBe('business');
  });

  it('passes the enterprise tier through (added v9 for hotels + large banquets)', () => {
    expect(parseTier('enterprise')).toBe('enterprise');
  });

  // While the FORCE_PRO_DURING_BETA constant in limits.ts is `true`,
  // missing / unknown tier values default to 'pro' instead of 'free' so
  // beta testers without explicit Clerk metadata get full features.
  // When the constant flips to `false` at public launch, the default
  // returns to 'free' — update this spec then.
  it('defaults missing / unknown values to "pro" during the private-beta override', () => {
    expect(parseTier(undefined)).toBe('pro');
    expect(parseTier(null)).toBe('pro');
    expect(parseTier('not-a-tier')).toBe('pro');
    expect(parseTier(42)).toBe('pro');
  });
});
