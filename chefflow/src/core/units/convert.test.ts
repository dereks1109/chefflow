import { describe, it, expect } from 'vitest';
import { convertUnit } from './convert';

describe('convertUnit — weight', () => {
  it('converts grams to kilograms', () => {
    expect(convertUnit(1000, 'g', 'kg')).toBeCloseTo(1, 6);
  });
  it('converts grams to ounces', () => {
    expect(convertUnit(28.3495, 'g', 'oz')).toBeCloseTo(1, 4);
  });
  it('converts pounds to grams', () => {
    expect(convertUnit(1, 'lb', 'g')).toBeCloseTo(453.592, 3);
  });
  it('returns identity when source equals target', () => {
    expect(convertUnit(500, 'g', 'g')).toBe(500);
  });
});

describe('convertUnit — volume', () => {
  it('converts milliliters to cups', () => {
    expect(convertUnit(236.588, 'ml', 'cup')).toBeCloseTo(1, 4);
  });
  it('converts tablespoons to milliliters', () => {
    expect(convertUnit(1, 'tbsp', 'ml')).toBeCloseTo(14.7868, 3);
  });
  it('converts cups to liters', () => {
    expect(convertUnit(4, 'cup', 'L')).toBeCloseTo(0.946, 2);
  });
});

describe('convertUnit — temperature', () => {
  it('converts Celsius to Fahrenheit', () => {
    expect(convertUnit(180, 'C', 'F')).toBeCloseTo(356, 1);
  });
  it('converts Fahrenheit to Celsius', () => {
    expect(convertUnit(350, 'F', 'C')).toBeCloseTo(176.67, 1);
  });
  it('water freezing point round-trip', () => {
    expect(convertUnit(0, 'C', 'F')).toBe(32);
    expect(convertUnit(32, 'F', 'C')).toBe(0);
  });
});

describe('convertUnit — errors', () => {
  it('throws on unknown unit', () => {
    expect(() => convertUnit(1, 'g', 'kilometers')).toThrow(/Unknown unit/);
  });
  it('throws when converting across dimensions', () => {
    expect(() => convertUnit(1, 'g', 'ml')).toThrow(/Cannot convert/);
  });
});
