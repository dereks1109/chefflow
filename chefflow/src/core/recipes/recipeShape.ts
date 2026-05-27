// Read-shim helpers for `Recipe.allergens`, which moved out of
// `Recipe.analysis` on 2026-05-27. The legacy nested field is kept on
// RecipeAnalysis as @deprecated so existing Dexie / D1 rows continue to
// render correctly while the opportunistic-promote in
// `db/recipesRepo.saveRecipe` migrates them up on the next save.
//
// Every UI / worker read path that wants `allergens` MUST use this
// helper. Once telemetry confirms no remaining `analysis.allergens`
// rows in D1, the legacy field can be dropped from RecipeAnalysis +
// this helper simplified to a direct field read.
//
// keyIngredientTags was removed entirely on 2026-05-28 (the "Key
// ingredient tags" feature was scrapped — chef-declared allergens
// remain the only safety-relevant tag).

import type { AllergenTag, Recipe } from '../types';

export function getRecipeAllergenList(r: Pick<Recipe, 'allergens' | 'analysis'>): AllergenTag[] {
  return r.allergens ?? r.analysis?.allergens ?? [];
}

/** Lift legacy `analysis.allergens` to the top-level field, and clear
 *  any leftover `analysis.keyIngredientTags` from the now-removed
 *  feature. Returns a new Recipe (never mutates). Idempotent: a recipe
 *  with only top-level fields is returned unchanged. */
export function promoteLegacyRecipeFields(r: Recipe): Recipe {
  const legacyAllergens = r.analysis?.allergens;
  // Cast to access the dropped field on legacy data without re-introducing
  // it in the Recipe type.
  const legacyKeyTags = (r.analysis as { keyIngredientTags?: unknown } | undefined)?.keyIngredientTags;
  if (legacyAllergens === undefined && legacyKeyTags === undefined) return r;

  const nextAnalysis = r.analysis ? { ...r.analysis } : undefined;
  if (nextAnalysis) {
    delete nextAnalysis.allergens;
    delete (nextAnalysis as { keyIngredientTags?: unknown }).keyIngredientTags;
  }
  return {
    ...r,
    allergens: r.allergens ?? legacyAllergens,
    analysis: nextAnalysis,
  };
}
