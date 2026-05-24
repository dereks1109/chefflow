import { describe, it, expect } from 'vitest';
import {
  findAllergensInIngredient,
  findIngredientsForAllergen,
  getRecipeAllergens,
  applyRecipeAllergenAdd,
  applyRecipeAllergenRemove,
  applyIngredientAllergenAdd,
  applyIngredientAllergenRemove,
} from './allergens';
import type { AllergenTag, Recipe } from '../../types';

function recipe(allergens: string[], ingredients: string[]): Recipe {
  return {
    id: 'r1',
    title: 'Test',
    originalYield: 1,
    ingredients: ingredients.map((name, i) => ({
      id: `i${i}`,
      raw: `{1|x|${name}}`,
      amount: 1,
      unit: 'x',
      name,
      isLocked: false,
    })),
    steps: [],
    createdAt: 0,
    updatedAt: 0,
    analysis: { allergens: allergens as never },
  };
}

/** Recipe builder with per-ingredient `allergenFlags` for the union tests. */
function recipeWithFlags(
  analysisAllergens: string[],
  ingredients: Array<{ name: string; flags?: AllergenTag[] }>,
): Recipe {
  return {
    id: 'r1',
    title: 'Test',
    originalYield: 1,
    ingredients: ingredients.map((i, idx) => ({
      id: `i${idx}`,
      raw: `{1|x|${i.name}}`,
      amount: 1,
      unit: 'x',
      name: i.name,
      isLocked: false,
      ...(i.flags ? { allergenFlags: i.flags } : {}),
    })),
    steps: [],
    createdAt: 0,
    updatedAt: 0,
    analysis: { allergens: analysisAllergens as never },
  };
}

describe('findAllergensInIngredient', () => {
  it('returns empty when no allergens are declared', () => {
    expect(findAllergensInIngredient('beef chuck', [])).toEqual([]);
  });

  it('returns empty when the ingredient name does not match any declared allergen', () => {
    expect(findAllergensInIngredient('beef chuck', ['eggs', 'milk'])).toEqual([]);
  });

  it('matches a single allergen carrier', () => {
    expect(findAllergensInIngredient('whole milk', ['milk', 'eggs'])).toEqual(['milk']);
  });

  it('matches multiple allergens when the name contains multiple carrier words', () => {
    // Cream cheese carries milk; the regex matches both "cream" and "cheese".
    expect(findAllergensInIngredient('cream cheese', ['milk'])).toEqual(['milk']);
    // Note: "soy sauce" matches only soybeans here — even though it's typically
    // wheat-brewed, the regex matches on words in the name, not on chemistry.
    // The recipe-level allergen list (from the LLM) will still flag gluten
    // separately if it's present.
    expect(findAllergensInIngredient('soy sauce', ['soybeans', 'gluten'])).toEqual(['soybeans']);
  });

  it('is case-insensitive', () => {
    expect(findAllergensInIngredient('SALMON FILLETS', ['fish'])).toEqual(['fish']);
  });

  it('matches across spelling variants (sulphite / sulfite, yoghurt / yogurt)', () => {
    expect(findAllergensInIngredient('Greek yogurt', ['milk'])).toEqual(['milk']);
    expect(findAllergensInIngredient('greek yoghurt', ['milk'])).toEqual(['milk']);
  });

  it('only returns allergens that are in the declared set, not all matching ones', () => {
    // The ingredient contains both 'cream' (milk) and 'wine' (sulphites), but if
    // only milk is declared on the recipe, only milk is returned.
    expect(findAllergensInIngredient('cream wine reduction', ['milk'])).toEqual(['milk']);
  });

  it('handles tree-nut variants (almonds, walnuts, pistachios)', () => {
    expect(findAllergensInIngredient('toasted almonds', ['tree-nuts'])).toEqual(['tree-nuts']);
    expect(findAllergensInIngredient('walnut pieces', ['tree-nuts'])).toEqual(['tree-nuts']);
    expect(findAllergensInIngredient('pistachio kernels', ['tree-nuts'])).toEqual(['tree-nuts']);
  });

  it('does NOT match unrelated words (coconut is not a tree nut, no match)', () => {
    expect(findAllergensInIngredient('coconut milk', ['tree-nuts'])).toEqual([]);
  });

  it('returns empty for empty / whitespace ingredient names', () => {
    expect(findAllergensInIngredient('', ['milk'])).toEqual([]);
    expect(findAllergensInIngredient('   ', ['milk'])).toEqual([]);
  });
});

describe('findIngredientsForAllergen', () => {
  it('returns triggering ingredients when the recipe declares that allergen — chefs see WHY a pill flagged', () => {
    const r = recipe(['milk'], ['butter', 'cream', 'beef']);
    expect(findIngredientsForAllergen(r, 'milk')).toEqual(['butter', 'cream']);
  });

  it('returns [] when the recipe does not declare that allergen — guards against false positives if analysis hasn\'t run', () => {
    const r = recipe(['celery'], ['butter', 'cream']);
    // milk isn't declared on this recipe → the helper should NOT scan for it,
    // even though butter/cream would trigger the regex.
    expect(findIngredientsForAllergen(r, 'milk')).toEqual([]);
  });

  it('dedupes ingredients with the same name (case-insensitive) — the audit + popover should not show duplicates', () => {
    const r = recipe(['milk'], ['butter', 'Butter', 'cream']);
    expect(findIngredientsForAllergen(r, 'milk')).toEqual(['butter', 'cream']);
  });

  it('returns the manually-flagged ingredient even when the tag is absent from analysis.allergens', () => {
    // Chef added "milk" flag on the Onion row in the editor. The recipe-
    // level analysis has not yet been re-run, so analysis.allergens is
    // still empty. The library tooltip MUST still surface Onion as the
    // cause, otherwise the chef's deliberate safety annotation is lost.
    const r = recipeWithFlags([], [
      { name: 'Onion', flags: ['milk'] },
      { name: 'Carrot' },
    ]);
    expect(findIngredientsForAllergen(r, 'milk')).toEqual(['Onion']);
  });

  it('merges manually-flagged + auto-matched ingredients deterministically', () => {
    // 'butter' auto-matches via regex (analysis declares milk); 'Onion'
    // doesn't match the regex but is manually flagged → both should appear.
    const r = recipeWithFlags(['milk'], [
      { name: 'butter' },
      { name: 'Onion', flags: ['milk'] },
    ]);
    expect(findIngredientsForAllergen(r, 'milk')).toEqual(['butter', 'Onion']);
  });
});

describe('getRecipeAllergens (union)', () => {
  it('returns analysis-level allergens when no ingredient is manually flagged', () => {
    const r = recipeWithFlags(['milk', 'eggs'], [{ name: 'butter' }]);
    expect(getRecipeAllergens(r)).toEqual(['eggs', 'milk']);
  });

  it('promotes a manually-flagged allergen to the recipe-level list', () => {
    // No AI analysis run yet. Chef tags one ingredient. The library card
    // + editor summary should now show "milk" — the chef's manual tag
    // shouldn't be invisible until the analyzer happens to be re-run.
    const r = recipeWithFlags([], [
      { name: 'Onion', flags: ['milk'] },
    ]);
    expect(getRecipeAllergens(r)).toEqual(['milk']);
  });

  it('takes the union of analysis-level + every ingredient.allergenFlags', () => {
    const r = recipeWithFlags(['milk'], [
      { name: 'Onion', flags: ['eggs'] },
      { name: 'Sesame paste', flags: ['sesame'] },
    ]);
    expect(getRecipeAllergens(r)).toEqual(['eggs', 'milk', 'sesame']);
  });

  it('dedupes when the same allergen is in both analysis + a flag', () => {
    const r = recipeWithFlags(['milk'], [
      { name: 'butter', flags: ['milk'] },
    ]);
    expect(getRecipeAllergens(r)).toEqual(['milk']);
  });

  it('drops unknown allergen strings (defensive — schema bugs cannot leak garbage tags into the UI)', () => {
    const r = recipeWithFlags(['milk', 'not-a-real-allergen' as never], [
      { name: 'Onion', flags: ['eggs', 'totally-fake' as never] },
    ]);
    expect(getRecipeAllergens(r)).toEqual(['eggs', 'milk']);
  });
});

describe('applyRecipeAllergenAdd (cascade: recipe → ingredients)', () => {
  it('adds the tag to analysis AND flags every regex-matching ingredient', () => {
    const r = recipeWithFlags([], [
      { name: 'butter' },
      { name: 'beef chuck' },
      { name: 'fresh cream' },
    ]);
    const next = applyRecipeAllergenAdd(r, 'milk');
    expect(next.analysis?.allergens).toEqual(['milk']);
    expect(next.ingredients[0].allergenFlags).toEqual(['milk']); // butter → matches
    expect(next.ingredients[1].allergenFlags).toBeUndefined();    // beef → no match
    expect(next.ingredients[2].allergenFlags).toEqual(['milk']);  // cream → matches
  });

  it('preserves existing per-ingredient allergenFlags (union, not overwrite)', () => {
    const r = recipeWithFlags([], [
      { name: 'butter', flags: ['eggs'] },
    ]);
    const next = applyRecipeAllergenAdd(r, 'milk');
    expect(next.ingredients[0].allergenFlags).toEqual(['eggs', 'milk']);
  });

  it('is idempotent — re-adding the same tag does not duplicate', () => {
    const once = applyRecipeAllergenAdd(recipeWithFlags([], [{ name: 'butter' }]), 'milk');
    const twice = applyRecipeAllergenAdd(once, 'milk');
    expect(twice.analysis?.allergens).toEqual(['milk']);
    expect(twice.ingredients[0].allergenFlags).toEqual(['milk']);
  });

  it('does NOT touch keyIngredientTags or other analysis fields', () => {
    const base = recipeWithFlags([], [{ name: 'butter' }]);
    base.analysis = { allergens: [] as never, keyIngredientTags: ['beef'], caloriesPerPortion: 500 };
    const next = applyRecipeAllergenAdd(base, 'milk');
    expect(next.analysis?.keyIngredientTags).toEqual(['beef']);
    expect(next.analysis?.caloriesPerPortion).toBe(500);
  });
});

describe('applyRecipeAllergenRemove (cascade: recipe → ingredients)', () => {
  it('removes the tag from analysis AND from every ingredient', () => {
    const r = recipeWithFlags(['milk', 'eggs'], [
      { name: 'butter', flags: ['milk'] },
      { name: 'cream', flags: ['milk', 'eggs'] },
    ]);
    const next = applyRecipeAllergenRemove(r, 'milk');
    expect(next.analysis?.allergens).toEqual(['eggs']);
    expect(next.ingredients[0].allergenFlags).toBeUndefined();    // only had milk → cleared
    expect(next.ingredients[1].allergenFlags).toEqual(['eggs']);  // milk stripped, eggs kept
  });

  it('is a no-op when the tag was never declared', () => {
    const r = recipeWithFlags(['eggs'], [{ name: 'butter' }]);
    const next = applyRecipeAllergenRemove(r, 'milk');
    expect(next.analysis?.allergens).toEqual(['eggs']);
  });
});

describe('applyIngredientAllergenAdd (promote: ingredient → recipe)', () => {
  it('adds the tag to that ingredient AND promotes to analysis.allergens', () => {
    const r = recipeWithFlags([], [{ name: 'Onion' }]);
    const onionId = r.ingredients[0].id;
    const next = applyIngredientAllergenAdd(r, onionId, 'milk');
    expect(next.ingredients[0].allergenFlags).toEqual(['milk']);
    expect(next.analysis?.allergens).toEqual(['milk']);
  });

  it('only flags the targeted ingredient — other ingredients are not touched', () => {
    const r = recipeWithFlags([], [{ name: 'Onion' }, { name: 'Carrot' }]);
    const onionId = r.ingredients[0].id;
    const next = applyIngredientAllergenAdd(r, onionId, 'milk');
    expect(next.ingredients[1].allergenFlags).toBeUndefined();
  });

  it('is idempotent — re-flagging the same ingredient does not duplicate', () => {
    const r = recipeWithFlags([], [{ name: 'Onion' }]);
    const onceR = applyIngredientAllergenAdd(r, r.ingredients[0].id, 'milk');
    const twiceR = applyIngredientAllergenAdd(onceR, r.ingredients[0].id, 'milk');
    expect(twiceR.ingredients[0].allergenFlags).toEqual(['milk']);
    expect(twiceR.analysis?.allergens).toEqual(['milk']);
  });
});

describe('applyIngredientAllergenRemove (de-promote only when no other source remains)', () => {
  it('removes the flag from one ingredient but keeps recipe-level tag when ANOTHER ingredient still carries it', () => {
    const r = recipeWithFlags(['milk'], [
      { name: 'butter', flags: ['milk'] },
      { name: 'cream', flags: ['milk'] },
    ]);
    const next = applyIngredientAllergenRemove(r, r.ingredients[0].id, 'milk');
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.ingredients[1].allergenFlags).toEqual(['milk']);
    expect(next.analysis?.allergens).toEqual(['milk']); // cream still has it → recipe-level stays
  });

  it('de-promotes from analysis when no manual flag AND no regex auto-match remains', () => {
    const r = recipeWithFlags(['milk'], [
      { name: 'Onion', flags: ['milk'] },  // ingredient name does NOT regex-match milk
    ]);
    const next = applyIngredientAllergenRemove(r, r.ingredients[0].id, 'milk');
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.analysis?.allergens).toEqual([]); // no other source → recipe-level cleared
  });

  it('does NOT de-promote when the ingredient name itself still regex-matches', () => {
    // butter REGEX-matches 'milk' even after the manual flag is cleared.
    // The recipe-level allergen should stay because the name itself is a
    // sufficient source of truth.
    const r = recipeWithFlags(['milk'], [
      { name: 'butter', flags: ['milk'] },
    ]);
    const next = applyIngredientAllergenRemove(r, r.ingredients[0].id, 'milk');
    expect(next.ingredients[0].allergenFlags).toBeUndefined();
    expect(next.analysis?.allergens).toEqual(['milk']);
  });
});
