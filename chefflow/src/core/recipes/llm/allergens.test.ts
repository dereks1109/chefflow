import { describe, it, expect } from 'vitest';
import {
  ALLERGEN_TAGS,
  ALLERGEN_LABEL,
  ALLERGEN_EXAMPLES,
  isAllergenTag,
  applyRecipeAllergenAdd,
  applyRecipeAllergenRemove,
  applyIngredientAllergenAdd,
  applyIngredientAllergenRemove,
  getRecipeAllergens,
} from './allergens';
import type { Recipe, AllergenTag } from '../../types';

function makeRecipe(over: Partial<Recipe> = {}): Recipe {
  const base: Recipe = {
    id: 'r1',
    title: 'Test recipe',
    originalYield: 4,
    ingredients: [
      { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false },
      { id: 'i2', raw: '', amount: 200, unit: 'g', name: 'beef chuck', isLocked: false },
    ],
    steps: [],
    createdAt: 0,
    updatedAt: 0,
  };
  return { ...base, ...over };
}

describe('ALLERGEN taxonomy', () => {
  it('lists all 14 UK declared allergens', () => {
    expect(ALLERGEN_TAGS).toHaveLength(14);
    expect(new Set(ALLERGEN_TAGS).size).toBe(14);
  });

  it('has a label and an example string for every tag', () => {
    for (const tag of ALLERGEN_TAGS) {
      expect(ALLERGEN_LABEL[tag]).toBeTypeOf('string');
      expect(ALLERGEN_LABEL[tag].length).toBeGreaterThan(0);
      expect(ALLERGEN_EXAMPLES[tag]).toBeTypeOf('string');
      expect(ALLERGEN_EXAMPLES[tag].length).toBeGreaterThan(0);
    }
  });
});

describe('isAllergenTag', () => {
  it('accepts every closed-set tag', () => {
    for (const tag of ALLERGEN_TAGS) expect(isAllergenTag(tag)).toBe(true);
  });
  it('rejects anything outside the closed set', () => {
    expect(isAllergenTag('not-an-allergen')).toBe(false);
    expect(isAllergenTag(42)).toBe(false);
    expect(isAllergenTag(null)).toBe(false);
    expect(isAllergenTag(undefined)).toBe(false);
  });
});

describe('applyRecipeAllergenAdd', () => {
  it('adds the tag to analysis.allergens and does NOT touch any ingredient', () => {
    const r = makeRecipe();
    const next = applyRecipeAllergenAdd(r, 'milk');
    expect(next.analysis?.allergens).toEqual(['milk']);
    // Regression guard: the previous regex-cascade was removed. The chef is
    // responsible for tagging individual ingredients themselves.
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.ingredients[1].allergenFlags).toBeUndefined();
  });

  it('is idempotent — adding the same tag twice leaves a single entry', () => {
    const r = makeRecipe();
    const once = applyRecipeAllergenAdd(r, 'milk');
    const twice = applyRecipeAllergenAdd(once, 'milk');
    expect(twice.analysis?.allergens).toEqual(['milk']);
  });
});

describe('applyRecipeAllergenRemove', () => {
  it('removes the tag from analysis.allergens and does NOT touch ingredients', () => {
    const r = makeRecipe({
      analysis: { allergens: ['milk', 'gluten'] },
      ingredients: [
        { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false, allergenFlags: ['milk'] },
        { id: 'i2', raw: '', amount: 200, unit: 'g', name: 'flour', isLocked: false, allergenFlags: ['gluten'] },
      ],
    });
    const next = applyRecipeAllergenRemove(r, 'milk');
    expect(next.analysis?.allergens).toEqual(['gluten']);
    // Per-ingredient flags untouched — chef removes them via the row chip
    // separately. Removal at recipe level is a catch-all removal only.
    expect(next.ingredients[0].allergenFlags).toEqual(['milk']);
    expect(next.ingredients[1].allergenFlags).toEqual(['gluten']);
  });
});

describe('applyIngredientAllergenAdd', () => {
  it('adds a tag to the targeted ingredient AND promotes to recipe-level', () => {
    const r = makeRecipe();
    const next = applyIngredientAllergenAdd(r, 'i1', 'milk');
    expect(next.ingredients[0].allergenFlags).toEqual(['milk']);
    expect(next.ingredients[1].allergenFlags).toBeUndefined();
    expect(next.analysis?.allergens).toEqual(['milk']);
  });

  it('is a no-op when the ingredient already carries the tag', () => {
    const r = makeRecipe({
      ingredients: [
        { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false, allergenFlags: ['milk'] },
        { id: 'i2', raw: '', amount: 200, unit: 'g', name: 'beef', isLocked: false },
      ],
      analysis: { allergens: ['milk'] },
    });
    const next = applyIngredientAllergenAdd(r, 'i1', 'milk');
    expect(next.ingredients[0].allergenFlags).toEqual(['milk']);
    expect(next.analysis?.allergens).toEqual(['milk']);
  });
});

describe('applyIngredientAllergenRemove', () => {
  it('strips the tag from the targeted ingredient and de-promotes when no other ingredient carries it', () => {
    const r = makeRecipe({
      ingredients: [
        { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false, allergenFlags: ['milk'] },
        { id: 'i2', raw: '', amount: 200, unit: 'g', name: 'beef', isLocked: false },
      ],
      analysis: { allergens: ['milk'] },
    });
    const next = applyIngredientAllergenRemove(r, 'i1', 'milk');
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.analysis?.allergens).toEqual([]);
  });

  it('keeps the recipe-level tag when ANOTHER ingredient still carries it', () => {
    const r = makeRecipe({
      ingredients: [
        { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false, allergenFlags: ['milk'] },
        { id: 'i2', raw: '', amount: 50, unit: 'g', name: 'cream', isLocked: false, allergenFlags: ['milk'] },
      ],
      analysis: { allergens: ['milk'] },
    });
    const next = applyIngredientAllergenRemove(r, 'i1', 'milk');
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.ingredients[1].allergenFlags).toEqual(['milk']);
    expect(next.analysis?.allergens).toEqual(['milk']);
  });
});

describe('getRecipeAllergens', () => {
  it('returns the union of recipe-level and per-ingredient flags, sorted', () => {
    const r = makeRecipe({
      analysis: { allergens: ['milk'] },
      ingredients: [
        { id: 'i1', raw: '', amount: 100, unit: 'g', name: 'butter', isLocked: false, allergenFlags: ['milk'] },
        { id: 'i2', raw: '', amount: 200, unit: 'g', name: 'flour', isLocked: false, allergenFlags: ['gluten'] },
      ],
    });
    expect(getRecipeAllergens(r)).toEqual(['gluten', 'milk']);
  });

  it('filters out garbage values that snuck into persisted data', () => {
    const r = makeRecipe({
      analysis: { allergens: ['milk', 'not-a-tag' as unknown as AllergenTag] },
    });
    expect(getRecipeAllergens(r)).toEqual(['milk']);
  });

  it('returns [] when nothing is flagged anywhere', () => {
    expect(getRecipeAllergens(makeRecipe())).toEqual([]);
  });
});
