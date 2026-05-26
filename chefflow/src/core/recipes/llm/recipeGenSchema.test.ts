import { describe, it, expect } from 'vitest';
import { parseLlmRecipe, LlmRecipeValidationError } from './recipeGenSchema';

const valid = {
  title: 'Beef Bourguignon',
  originalYield: 4,
  prepTime: '30 min',
  cookTime: '3 hr',
  ingredients: [
    { raw: '{800|g|beef chuck}', amount: 800, unit: 'g', name: 'beef chuck' },
    { amount: 200, unit: 'ml', name: 'red wine' },
  ],
  steps: [
    { text: 'Sear beef', durationSec: 600, phase: 'cook' },
    { text: 'Simmer 2 hours', durationSec: 7200, phase: 'cook' },
  ],
  analysis: {
    caloriesPerPortion: 612,
    caloriesTotal: 2448,
    keyIngredientTags: ['beef', 'red wine', 'bacon'],
    allergens: ['sulphites'],
  },
};

describe('parseLlmRecipe — happy path', () => {
  it('accepts a fully-populated valid recipe (allergens silently dropped — user-declared only)', () => {
    const r = parseLlmRecipe(valid);
    expect(r.title).toBe('Beef Bourguignon');
    expect(r.originalYield).toBe(4);
    expect(r.prepTime).toBe('30 min');
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toHaveLength(2);
    // The LLM no longer participates in allergen tagging — even when a
    // stale model sends `allergens: [...]` the field is dropped.
    expect((r.analysis as { allergens?: unknown }).allergens).toBeUndefined();
    expect(r.analysis.caloriesPerPortion).toBe(612);
  });

  it('synthesizes ingredient.raw when omitted', () => {
    const r = parseLlmRecipe(valid);
    expect(r.ingredients[1].raw).toBe('{200|ml|red wine}');
  });

  it('defaults missing step.phase to "cook" and missing durationSec to 0', () => {
    const r = parseLlmRecipe({
      ...valid,
      steps: [{ text: 'Mix' }],
    });
    expect(r.steps[0].phase).toBe('cook');
    expect(r.steps[0].durationSec).toBe(0);
  });
});

describe('parseLlmRecipe — analysis leniency', () => {
  it('returns empty analysis when the field is missing entirely', () => {
    const { analysis } = parseLlmRecipe({ ...valid, analysis: undefined });
    expect((analysis as { allergens?: unknown }).allergens).toBeUndefined();
    expect(analysis.keyIngredientTags).toEqual([]);
    expect(analysis.caloriesPerPortion).toBeUndefined();
    expect(analysis.caloriesTotal).toBeUndefined();
  });

  it('silently ignores any allergens field the LLM emits — never surfaces them', () => {
    const r = parseLlmRecipe({
      ...valid,
      analysis: { ...valid.analysis, allergens: ['sulphites', 'nightshade', 'eggs'] },
    });
    expect((r.analysis as { allergens?: unknown }).allergens).toBeUndefined();
  });

  it('silently ignores any uncertainIngredients field the LLM emits — never surfaces them', () => {
    const r = parseLlmRecipe({
      ...valid,
      analysis: { ...valid.analysis, uncertainIngredients: ['house chilli paste'] },
    });
    expect((r.analysis as { uncertainIngredients?: unknown }).uncertainIngredients).toBeUndefined();
  });

  it('lowercases + dedupes key-ingredient tags', () => {
    const r = parseLlmRecipe({
      ...valid,
      analysis: { ...valid.analysis, keyIngredientTags: ['Beef', 'beef', '  Red Wine '] },
    });
    expect(r.analysis.keyIngredientTags).toEqual(['beef', 'red wine']);
  });

  it('drops negative or NaN calorie values', () => {
    const r = parseLlmRecipe({
      ...valid,
      analysis: { ...valid.analysis, caloriesPerPortion: -10, caloriesTotal: Number.NaN },
    });
    expect(r.analysis.caloriesPerPortion).toBeUndefined();
    expect(r.analysis.caloriesTotal).toBeUndefined();
  });
});

describe('parseLlmRecipe — structural errors', () => {
  it('throws when title is missing', () => {
    expect(() => parseLlmRecipe({ ...valid, title: '' })).toThrow(LlmRecipeValidationError);
  });

  it('throws when originalYield is not a positive integer', () => {
    expect(() => parseLlmRecipe({ ...valid, originalYield: 0 })).toThrow(/positive integer/);
    expect(() => parseLlmRecipe({ ...valid, originalYield: 2.5 })).toThrow(/positive integer/);
  });

  it('throws when ingredients is empty', () => {
    expect(() => parseLlmRecipe({ ...valid, ingredients: [] })).toThrow(/at least one ingredient/);
  });

  it('throws when steps is empty', () => {
    expect(() => parseLlmRecipe({ ...valid, steps: [] })).toThrow(/at least one step/);
  });

  it('throws when an ingredient is missing unit', () => {
    const bad = {
      ...valid,
      ingredients: [{ amount: 100, name: 'salt' } as unknown],
    };
    expect(() => parseLlmRecipe(bad)).toThrow(LlmRecipeValidationError);
  });

  it('carries the path on the error', () => {
    try {
      parseLlmRecipe({ ...valid, steps: [{ text: '' }] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LlmRecipeValidationError);
      expect((e as LlmRecipeValidationError).path).toBe('steps[0]');
    }
  });
});
