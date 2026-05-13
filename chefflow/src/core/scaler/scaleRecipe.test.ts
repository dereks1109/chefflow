import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRecipe } from '../parser/parseRecipe';
import { scaleRecipe } from './scaleRecipe';

const stewMd = readFileSync(
  resolve(__dirname, '../../../tests/fixtures/beef-stew.md'),
  'utf-8'
);
const stew = parseRecipe(stewMd);

describe('scaleRecipe — basic', () => {
  it('scales 4-portion recipe to 12 (3x)', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 12, system: 'metric' });
    const beef = scaled.ingredients.find(i => i.name === 'Beef Chuck')!;
    expect(beef.amount).toBe(2.4);    // 800g × 3 = 2400g → 2.4kg
    expect(beef.unit).toBe('kg');
  });
  it('keeps locked ingredient at original amount', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 12, system: 'metric' });
    const salt = scaled.ingredients.find(i => i.name === 'Salt')!;
    expect(salt.amount).toBe(1);
    expect(salt.unit).toBe('tsp');
    expect(salt.isLocked).toBe(true);
  });
  it('updates ingredient.raw to match scaled amount', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 12, system: 'metric' });
    const beef = scaled.ingredients.find(i => i.name === 'Beef Chuck')!;
    expect(beef.raw).toBe('{2.4|kg|Beef Chuck}');
  });
  it('scales volume with normalization (250ml × 4 = 1000ml → 1L)', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 16, system: 'metric' });
    const wine = scaled.ingredients.find(i => i.name === 'Red Wine')!;
    expect(wine.amount).toBe(1);
    expect(wine.unit).toBe('L');
  });
  it('identity when targetPortions equals originalYield', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 4, system: 'metric' });
    expect(scaled.ingredients[0].amount).toBe(stew.ingredients[0].amount);
  });
  it('preserves steps unchanged', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 12, system: 'metric' });
    expect(scaled.steps).toEqual(stew.steps);
  });
});

describe('scaleRecipe — unit system conversion', () => {
  it('converts metric → imperial', () => {
    const scaled = scaleRecipe(stew, { targetPortions: 4, system: 'imperial' });
    const beef = scaled.ingredients.find(i => i.name === 'Beef Chuck')!;
    // 800g → ~28.22oz → normalize 16oz=1lb → 1.7637lb → roundSensible (<10 → 0.25 step) → 1.75 lb
    expect(beef.unit).toBe('lb');
    expect(beef.amount).toBeCloseTo(1.75, 2);
  });
  it("uses auto (keep original units) when system='auto'", () => {
    const scaled = scaleRecipe(stew, { targetPortions: 8, system: 'auto' });
    const beef = scaled.ingredients.find(i => i.name === 'Beef Chuck')!;
    // 800g × 2 = 1600g → normalize within metric → 1.6kg.
    // 'auto' keeps source unit family but allows normalization within family.
    expect(['g', 'kg']).toContain(beef.unit);
  });
});
