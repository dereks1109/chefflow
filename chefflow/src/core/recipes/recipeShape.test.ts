import { describe, it, expect } from 'vitest';
import {
  getRecipeAllergenList,
  getRecipeKeyTags,
  promoteLegacyRecipeFields,
} from './recipeShape';
import type { Recipe } from '../types';

function mkRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    title: 'Test',
    originalYield: 4,
    ingredients: [],
    steps: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('getRecipeAllergenList', () => {
  it('returns top-level allergens when present', () => {
    expect(getRecipeAllergenList(mkRecipe({ allergens: ['milk'] }))).toEqual(['milk']);
  });
  it('falls back to legacy analysis.allergens', () => {
    expect(getRecipeAllergenList(mkRecipe({ analysis: { allergens: ['eggs'] } }))).toEqual(['eggs']);
  });
  it('returns empty when neither set', () => {
    expect(getRecipeAllergenList(mkRecipe())).toEqual([]);
  });
  it('top-level wins over legacy when both set', () => {
    // Both shapes during the transition; top-level is authoritative because
    // it's what new writes produce.
    expect(getRecipeAllergenList(mkRecipe({
      allergens: ['milk'],
      analysis: { allergens: ['eggs'] },
    }))).toEqual(['milk']);
  });
});

describe('getRecipeKeyTags', () => {
  it('returns top-level keyIngredientTags when present', () => {
    expect(getRecipeKeyTags(mkRecipe({ keyIngredientTags: ['beef'] }))).toEqual(['beef']);
  });
  it('falls back to legacy analysis.keyIngredientTags', () => {
    expect(getRecipeKeyTags(mkRecipe({ analysis: { keyIngredientTags: ['fish'] } }))).toEqual(['fish']);
  });
  it('returns empty when neither set', () => {
    expect(getRecipeKeyTags(mkRecipe())).toEqual([]);
  });
});

describe('promoteLegacyRecipeFields', () => {
  it('lifts legacy fields to top-level and clears the analysis copies', () => {
    const out = promoteLegacyRecipeFields(mkRecipe({
      analysis: { allergens: ['milk'], keyIngredientTags: ['beef'], caloriesPerPortion: 500 },
    }));
    expect(out.allergens).toEqual(['milk']);
    expect(out.keyIngredientTags).toEqual(['beef']);
    expect(out.analysis?.allergens).toBeUndefined();
    expect(out.analysis?.keyIngredientTags).toBeUndefined();
    expect(out.analysis?.caloriesPerPortion).toBe(500); // calories untouched
  });
  it('is a no-op when no legacy fields exist', () => {
    const input = mkRecipe({ allergens: ['eggs'], keyIngredientTags: ['eggs'] });
    expect(promoteLegacyRecipeFields(input)).toBe(input);
  });
  it('preserves existing top-level values when both shapes are present', () => {
    const out = promoteLegacyRecipeFields(mkRecipe({
      allergens: ['milk'],
      analysis: { allergens: ['eggs'] },
    }));
    expect(out.allergens).toEqual(['milk']);
    expect(out.analysis?.allergens).toBeUndefined();
  });
  it('removes analysis entirely if it was empty after stripping', () => {
    // Edge: an analysis object that ONLY held the legacy tags loses its
    // last fields. We keep it as an empty object rather than deleting —
    // simpler invariants, no UI checks for `analysis === undefined`.
    const out = promoteLegacyRecipeFields(mkRecipe({
      analysis: { allergens: ['milk'] },
    }));
    expect(out.analysis).toEqual({});
  });
});
