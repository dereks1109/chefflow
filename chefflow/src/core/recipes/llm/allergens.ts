// ---------------------------------------------------------------------------
// UK Top-14 declared food allergens — the closed taxonomy ChefFlow ships with.
//
// UK food law requires food businesses to declare these 14 allergens. The tag
// keys are kebab-case so they survive JSON / IndexedDB round-trips. Display
// labels + example sources are kept beside the tags so the UI badge component
// and the editor's chip-picker pull from one source of truth.
//
// Allergens are USER-DECLARED ONLY. ChefFlow does not detect them — the
// previous LLM + regex auto-detection paths were removed to keep ChefFlow
// out of the food-safety determination loop (the chef is the food business
// operator under FIR 2014).
// ---------------------------------------------------------------------------

import type { AllergenTag, Recipe } from '../../types';

export const ALLERGEN_TAGS: readonly AllergenTag[] = [
  'celery',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'peanuts',
  'sesame',
  'soybeans',
  'sulphites',
  'tree-nuts',
] as const;

export const ALLERGEN_LABEL: Record<AllergenTag, string> = {
  celery: 'Celery',
  gluten: 'Cereals containing gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soybeans: 'Soybeans',
  sulphites: 'Sulphur dioxide / sulphites',
  'tree-nuts': 'Tree nuts',
};

// One-line example strings shown to the chef in the allergen picker / tooltip
// so the closed taxonomy has concrete anchors.
export const ALLERGEN_EXAMPLES: Record<AllergenTag, string> = {
  celery: 'Stalks, leaves, seeds, celeriac',
  gluten: 'Wheat, rye, barley, oats',
  crustaceans: 'Prawns, crabs, lobsters, langoustines',
  eggs: 'Hen eggs, duck eggs, quail eggs, goose eggs',
  fish: 'Salmon, cod, tuna, anchovies',
  lupin: 'Lupin seeds, lupin beans, lupin flour, lupin flakes',
  milk: "Cow's milk, goat's milk, sheep's milk, buffalo milk",
  molluscs: 'Mussels, oysters, squid, snails',
  mustard: 'Mustard seeds, mustard powder, mustard leaves',
  peanuts: 'Whole peanuts, ground peanuts, peanut kernels',
  sesame: 'Sesame seeds',
  soybeans: 'Whole soya beans, edamame beans, soya flour',
  sulphites: 'Sulphur dioxide gas, sodium metabisulphite, potassium metabisulphite',
  'tree-nuts': 'Almonds, walnuts, cashews, hazelnuts',
};

const TAG_SET: ReadonlySet<string> = new Set(ALLERGEN_TAGS);

/** True if `s` is one of the 14 closed allergen tags. */
export function isAllergenTag(s: unknown): s is AllergenTag {
  return typeof s === 'string' && TAG_SET.has(s);
}

// ---------------------------------------------------------------------------
// Pure mutation helpers — return a new Recipe, never mutate. Used by the
// editor to keep `recipe.analysis.allergens` (recipe-level catch-all) and
// per-ingredient `ingredient.allergenFlags` consistent when the chef adds
// or removes a tag.
//
// Critically: NONE of these helpers cascade across the recipe/ingredient
// boundary on ADD/REMOVE at recipe level. The chef who adds "milk" at recipe
// level is making a recipe-wide declaration; they then click the per-
// ingredient chips themselves if they want to mark which ingredient carries
// it. The previous regex-cascade was removed for legal-risk reasons.
//
// The one exception is ingredient → recipe promotion: when the chef flags
// "milk" on the butter row, "milk" is also added to `analysis.allergens` so
// the recipe-level pill shows up immediately (the library card needs to
// reflect the safety signal). Symmetric removal: when the LAST ingredient
// loses its "milk" flag AND the chef hasn't independently declared "milk"
// at recipe level, "milk" is de-promoted.
// ---------------------------------------------------------------------------

/** Add a tag to the recipe-level catch-all. Does NOT touch ingredients. */
export function applyRecipeAllergenAdd(recipe: Recipe, tag: AllergenTag): Recipe {
  const declared = new Set<AllergenTag>(recipe.analysis?.allergens ?? []);
  if (declared.has(tag)) return recipe;
  declared.add(tag);
  return {
    ...recipe,
    analysis: { ...(recipe.analysis ?? {}), allergens: Array.from(declared) },
  };
}

/** Remove a tag from the recipe-level catch-all. Does NOT touch ingredients. */
export function applyRecipeAllergenRemove(recipe: Recipe, tag: AllergenTag): Recipe {
  const declared = (recipe.analysis?.allergens ?? []).filter((a) => a !== tag);
  return {
    ...recipe,
    analysis: { ...(recipe.analysis ?? {}), allergens: declared },
  };
}

/**
 * Ingredient-level ADD: the chef flagged a tag on one ingredient row. Add
 * it to that ingredient's `allergenFlags` AND promote it to the recipe-level
 * catch-all if not already there — so the library card pill shows the
 * safety signal without a separate click.
 */
export function applyIngredientAllergenAdd(
  recipe: Recipe,
  ingredientId: string,
  tag: AllergenTag,
): Recipe {
  const nextIngredients = recipe.ingredients.map((ing) => {
    if (ing.id !== ingredientId) return ing;
    const flags = new Set<AllergenTag>(ing.allergenFlags ?? []);
    if (flags.has(tag)) return ing;
    flags.add(tag);
    return { ...ing, allergenFlags: Array.from(flags) };
  });
  const declared = new Set<AllergenTag>(recipe.analysis?.allergens ?? []);
  declared.add(tag);
  return {
    ...recipe,
    ingredients: nextIngredients,
    analysis: { ...(recipe.analysis ?? {}), allergens: Array.from(declared) },
  };
}

/**
 * Ingredient-level REMOVE: strip the tag from that ingredient. THEN: if no
 * other ingredient still carries the tag in its `allergenFlags`, also
 * de-promote from `analysis.allergens`. Symmetric to the ADD path.
 */
export function applyIngredientAllergenRemove(
  recipe: Recipe,
  ingredientId: string,
  tag: AllergenTag,
): Recipe {
  const nextIngredients = recipe.ingredients.map((ing) => {
    if (ing.id !== ingredientId) return ing;
    const flags = ing.allergenFlags;
    if (!flags || !flags.includes(tag)) return ing;
    const stripped = flags.filter((a) => a !== tag);
    return { ...ing, allergenFlags: stripped.length > 0 ? stripped : undefined };
  });
  const anyOtherSource = nextIngredients.some((ing) => ing.allergenFlags?.includes(tag));
  const declared = anyOtherSource
    ? (recipe.analysis?.allergens ?? [])
    : (recipe.analysis?.allergens ?? []).filter((a) => a !== tag);
  return {
    ...recipe,
    ingredients: nextIngredients,
    analysis: { ...(recipe.analysis ?? {}), allergens: declared },
  };
}

/**
 * Effective allergen list for display: union of the recipe-level catch-all
 * (`analysis.allergens`) and every per-ingredient `allergenFlags`. Sorted
 * alphabetically so the library card + editor render in the same order
 * regardless of insertion sequence.
 */
export function getRecipeAllergens(recipe: Recipe): AllergenTag[] {
  const set = new Set<AllergenTag>();
  for (const a of recipe.analysis?.allergens ?? []) {
    if (isAllergenTag(a)) set.add(a);
  }
  for (const ing of recipe.ingredients) {
    for (const a of ing.allergenFlags ?? []) {
      if (isAllergenTag(a)) set.add(a);
    }
  }
  return Array.from(set).sort();
}
