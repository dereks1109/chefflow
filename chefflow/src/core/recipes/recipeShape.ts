// Read-shim helpers for `Recipe.allergens` + `Recipe.keyIngredientTags`,
// which moved out of `Recipe.analysis` on 2026-05-27. The legacy nested
// fields are kept on RecipeAnalysis as @deprecated for one transition
// window so existing Dexie / D1 rows continue to render correctly while
// the opportunistic-promote in `db/recipesRepo.saveRecipe` migrates them
// up on the next save.
//
// Every UI / worker read path that wants these fields MUST use these
// helpers. Once telemetry confirms no remaining `analysis.allergens` /
// `analysis.keyIngredientTags` rows in D1, the legacy fields can be
// dropped from RecipeAnalysis + these helpers simplified to a direct
// field read.

import type { AllergenTag, Recipe } from '../types';

export function getRecipeAllergenList(r: Pick<Recipe, 'allergens' | 'analysis'>): AllergenTag[] {
  return r.allergens ?? r.analysis?.allergens ?? [];
}

export function getRecipeKeyTags(r: Pick<Recipe, 'keyIngredientTags' | 'analysis'>): string[] {
  return r.keyIngredientTags ?? r.analysis?.keyIngredientTags ?? [];
}

/** Lift legacy `analysis.allergens` / `analysis.keyIngredientTags` to
 *  top-level fields and clear them from the analysis object. Returns a
 *  new Recipe (never mutates). Idempotent: a recipe with only top-level
 *  fields is returned unchanged. */
export function promoteLegacyRecipeFields(r: Recipe): Recipe {
  const legacyAllergens = r.analysis?.allergens;
  const legacyKeyTags = r.analysis?.keyIngredientTags;
  if (legacyAllergens === undefined && legacyKeyTags === undefined) return r;

  const nextAnalysis = r.analysis ? { ...r.analysis } : undefined;
  if (nextAnalysis) {
    delete nextAnalysis.allergens;
    delete nextAnalysis.keyIngredientTags;
  }
  return {
    ...r,
    allergens: r.allergens ?? legacyAllergens,
    keyIngredientTags: r.keyIngredientTags ?? legacyKeyTags,
    analysis: nextAnalysis,
  };
}
