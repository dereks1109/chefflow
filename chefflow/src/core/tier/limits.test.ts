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
    expect(TIER_ORDER).toEqual(['free', 'pro', 'business']);
  });

  it('uses the prices the business model committed to (GBP)', () => {
    expect(TIER_PRICE_GBP.free.monthly).toBe(0);
    expect(TIER_PRICE_GBP.pro.monthly).toBe(12);
    expect(TIER_PRICE_GBP.pro.annual).toBe(108);
    expect(TIER_PRICE_GBP.business.monthly).toBe(39);
    expect(TIER_PRICE_GBP.business.annual).toBe(390);
  });

  it('free tier caps recipes at 5 and events at 1', () => {
    expect(TIER_LIMITS.free.maxRecipes).toBe(5);
    expect(TIER_LIMITS.free.maxActiveEvents).toBe(1);
    expect(TIER_LIMITS.free.maxLlmCallsPerMonth).toBe(10);
  });

  it('pro tier unlocks unlimited recipes and events', () => {
    expect(TIER_LIMITS.pro.maxRecipes).toBe(UNLIMITED);
    expect(TIER_LIMITS.pro.maxActiveEvents).toBe(UNLIMITED);
  });

  it('business tier unlocks 5 seats', () => {
    expect(TIER_LIMITS.business.maxSeats).toBe(5);
  });
});

describe('isUnderLimit', () => {
  it('returns true when usage is below the cap', () => {
    expect(isUnderLimit('free', 'maxRecipes', 3)).toBe(true);
  });

  it('returns false when usage equals the cap (next add would exceed it)', () => {
    expect(isUnderLimit('free', 'maxRecipes', 5)).toBe(false);
  });

  it('always returns true for unlimited caps', () => {
    expect(isUnderLimit('pro', 'maxRecipes', 9999)).toBe(true);
    expect(isUnderLimit('business', 'maxActiveEvents', 1000)).toBe(true);
  });
});

describe('hasFeature', () => {
  it('free lacks places autocomplete + workflow scheduler', () => {
    expect(hasFeature('free', 'hasPlacesAutocomplete')).toBe(false);
    expect(hasFeature('free', 'hasWorkflowScheduler')).toBe(false);
  });

  it('pro and business unlock both', () => {
    expect(hasFeature('pro', 'hasPlacesAutocomplete')).toBe(true);
    expect(hasFeature('pro', 'hasWorkflowScheduler')).toBe(true);
    expect(hasFeature('business', 'hasPlacesAutocomplete')).toBe(true);
    expect(hasFeature('business', 'hasWorkflowScheduler')).toBe(true);
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

  it('defaults to free for unknown / missing values', () => {
    expect(parseTier(undefined)).toBe('free');
    expect(parseTier(null)).toBe('free');
    expect(parseTier('enterprise')).toBe('free');
    expect(parseTier(42)).toBe('free');
  });
});
