import { describe, it, expect } from 'vitest';
import { normalizeMeasurement, roundSensible } from './normalize';

describe('normalizeMeasurement — metric weight', () => {
  it('upgrades 1000g → 1kg', () => {
    expect(normalizeMeasurement(1000, 'g', 'metric')).toEqual({ amount: 1, unit: 'kg' });
  });
  it('upgrades 1500g → 1.5kg', () => {
    expect(normalizeMeasurement(1500, 'g', 'metric')).toEqual({ amount: 1.5, unit: 'kg' });
  });
  it('keeps 999g as g', () => {
    expect(normalizeMeasurement(999, 'g', 'metric')).toEqual({ amount: 999, unit: 'g' });
  });
});

describe('normalizeMeasurement — metric volume', () => {
  it('upgrades 1000ml → 1L', () => {
    expect(normalizeMeasurement(1000, 'ml', 'metric')).toEqual({ amount: 1, unit: 'L' });
  });
  it('keeps 750ml as ml', () => {
    expect(normalizeMeasurement(750, 'ml', 'metric')).toEqual({ amount: 750, unit: 'ml' });
  });
});

describe('normalizeMeasurement — imperial weight', () => {
  it('upgrades 16oz → 1lb', () => {
    expect(normalizeMeasurement(16, 'oz', 'imperial')).toEqual({ amount: 1, unit: 'lb' });
  });
  it('keeps 15oz as oz', () => {
    expect(normalizeMeasurement(15, 'oz', 'imperial')).toEqual({ amount: 15, unit: 'oz' });
  });
});

describe('roundSensible (rules from recipe-scaler/SKILL.md)', () => {
  it('rounds >100 units to nearest 0.5', () => {
    expect(roundSensible(1237.3)).toBe(1237.5);
    expect(roundSensible(1237.1)).toBe(1237);
  });
  it('rounds 10–100 units to nearest 0.1', () => {
    expect(roundSensible(47.27)).toBe(47.3);
    expect(roundSensible(47.24)).toBe(47.2);
  });
  it('rounds <10 units to nearest 0.25', () => {
    expect(roundSensible(1.2)).toBe(1.25);
    expect(roundSensible(1.6)).toBe(1.5);
  });
  it('preserves whole numbers exactly', () => {
    expect(roundSensible(5)).toBe(5);
    expect(roundSensible(3)).toBe(3);
  });
});
