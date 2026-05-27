import { describe, it, expect } from 'vitest';
import {
  getRecipeAllergenList,
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
    expect(getRecipeAllergenList(mkRecipe({
      allergens: ['milk'],
      analysis: { allergens: ['eggs'] },
    }))).toEqual(['milk']);
  });
});

describe('promoteLegacyRecipeFields', () => {
  it('lifts legacy allergens to top-level and clears the analysis copy', () => {
    const out = promoteLegacyRecipeFields(mkRecipe({
      analysis: { allergens: ['milk'], caloriesPerPortion: 500 },
    }));
    expect(out.allergens).toEqual(['milk']);
    expect(out.analysis?.allergens).toBeUndefined();
    expect(out.analysis?.caloriesPerPortion).toBe(500); // calories untouched
  });

  it('strips legacy analysis.keyIngredientTags (feature removed 2026-05-28)', () => {
    // Build a recipe whose analysis carries the now-removed
    // keyIngredientTags field — older rows persisted before the drop.
    const legacy = mkRecipe({
      analysis: { caloriesPerPortion: 100 } as Recipe['analysis'],
    });
    (legacy.analysis as { keyIngredientTags?: string[] }).keyIngredientTags = ['beef', 'butter'];
    const out = promoteLegacyRecipeFields(legacy);
    expect((out.analysis as { keyIngredientTags?: unknown }).keyIngredientTags).toBeUndefined();
    // Calories survive.
    expect(out.analysis?.caloriesPerPortion).toBe(100);
  });

  it('is a no-op when no legacy fields exist', () => {
    const input = mkRecipe({ allergens: ['eggs'] });
    expect(promoteLegacyRecipeFields(input)).toBe(input);
  });

  it('preserves existing top-level allergens when both shapes are present', () => {
    const out = promoteLegacyRecipeFields(mkRecipe({
      allergens: ['milk'],
      analysis: { allergens: ['eggs'] },
    }));
    expect(out.allergens).toEqual(['milk']);
    expect(out.analysis?.allergens).toBeUndefined();
  });
});
