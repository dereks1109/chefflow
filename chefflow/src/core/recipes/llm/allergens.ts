// ---------------------------------------------------------------------------
// UK Top-14 declared food allergens — the closed taxonomy ChefFlow ships with.
//
// UK food law requires food businesses to declare these 14 allergens. The tag
// keys are kebab-case so they survive JSON / IndexedDB round-trips. Display
// labels + example sources are kept beside the tags so the prompt builder and
// the UI badge component pull from one source of truth.
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

// One-line example strings shown to both the chef (in the allergen picker /
// tooltip) and the LLM (in the system prompt) so the closed taxonomy has
// concrete anchors.
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
// Ingredient → allergen matching. The LLM declares allergens at the recipe
// level; this module flags which ingredients in the list actually carry them
// so the editor can visually highlight the offending rows. Conservative regex
// patterns — we'd rather over-flag than miss a known carrier.
// ---------------------------------------------------------------------------

const ALLERGEN_PATTERNS: Record<AllergenTag, RegExp> = {
  celery: /\b(celery|celeriac)\b/i,
  gluten: /\b(wheat|barley|rye|oats?|spelt|kamut|flour|breadcrumb|bread|pasta|noodle|seitan|couscous|semolina|bulgur|farro|cracker|biscuit)\b/i,
  crustaceans: /\b(prawn|shrimp|crab|lobster|crayfish|langoustine|krill)s?\b/i,
  eggs: /\b(eggs?|albumen|yolk|mayonnaise|meringue)\b/i,
  fish: /\b(fish|salmon|tuna|cod|anchov(?:y|ies)|sardine|haddock|trout|mackerel|sea bass|herring|sole|halibut|tilapia|snapper)\b/i,
  lupin: /\b(lupin|lupini)\b/i,
  milk: /\b(milk|butter|cream|cheese|yoghurt|yogurt|ghee|whey|casein|lactose|paneer|mozzarella|parmesan|cheddar|brie|feta|ricotta|gouda|mascarpone|labneh)\b/i,
  molluscs: /\b(mussel|oyster|squid|octopus|snail|scallop|clam|cuttlefish|abalone|whelk)s?\b/i,
  mustard: /\b(mustard|dijon)\b/i,
  peanuts: /\b(peanuts?|groundnuts?|arachis)\b/i,
  sesame: /\b(sesame|tahini|gomashio)\b/i,
  soybeans: /\b(soy|soya|tofu|tempeh|edamame|miso|natto)\b/i,
  sulphites: /\b(sulph(?:ite|ur)|sulfite|wine|vinegar|dried (?:fruit|apricot|raisin)|raisin|prune)\b/i,
  'tree-nuts': /\b(almonds?|hazelnuts?|walnuts?|cashews?|pecans?|brazil nuts?|pistachios?|macadamias?|pine nuts?|chestnuts?)\b/i,
};

/**
 * Of the recipe-level declared allergens, which ones does this ingredient
 * carry? Used by the editor to highlight rows that contribute to the
 * recipe's overall allergen list.
 *
 * Returns the intersection: an empty array means "this ingredient does not
 * contribute to any declared allergen" — though it does NOT mean the
 * ingredient is allergen-free (the recipe may not have run analysis yet).
 */
export function findAllergensInIngredient(
  ingredientName: string,
  declaredAllergens: readonly AllergenTag[],
): AllergenTag[] {
  if (!ingredientName || declaredAllergens.length === 0) return [];
  return declaredAllergens.filter((tag) => ALLERGEN_PATTERNS[tag].test(ingredientName));
}

/**
 * Reverse lookup — given a recipe and an allergen tag, which ingredient names
 * triggered it? Used by the library card popover so chefs see "Caused by:
 * butter, cream" when hovering the Milk pill. Returns ingredient names
 * deduped + in original order.
 *
 * Two sources are surfaced as causes:
 *   1. Any ingredient with `tag` in its `allergenFlags` — the chef's manual
 *      override always wins, even if `tag` was never in `recipe.analysis`.
 *   2. Any ingredient whose name matches the tag's regex AND the recipe
 *      already declares `tag` at the analysis level — guards against false
 *      positives when AI analysis hasn't run yet.
 */
export function findIngredientsForAllergen(recipe: Recipe, tag: AllergenTag): string[] {
  const declared = recipe.analysis?.allergens ?? [];
  const tagDeclared = declared.includes(tag);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ing of recipe.ingredients) {
    const name = ing.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    const manuallyFlagged = ing.allergenFlags?.includes(tag) === true;
    const autoMatch = tagDeclared && findAllergensInIngredient(name, declared).includes(tag);
    if (manuallyFlagged || autoMatch) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bidirectional sync helpers — keep `recipe.analysis.allergens` and every
// `ingredient.allergenFlags` mirroring each other so chefs don't see drift
// between the editor's recipe-level pill row and the per-ingredient chips.
//
// All four helpers are PURE — return a new Recipe, never mutate. Callers
// (RecipeEditor) feed the result into the recipe state. `keyIngredientTags`
// + every other field flows through untouched.
// ---------------------------------------------------------------------------

/**
 * Recipe-level ADD: the chef typed an allergen into AnalysisSection's tag
 * input. Add it to `analysis.allergens` AND to `allergenFlags` of every
 * ingredient whose name regex-matches the tag (via findAllergensInIngredient).
 * Ingredients without a match are left alone — auto-flagging unrelated rows
 * would surprise the chef.
 */
export function applyRecipeAllergenAdd(recipe: Recipe, tag: AllergenTag): Recipe {
  const declared = new Set<AllergenTag>(recipe.analysis?.allergens ?? []);
  declared.add(tag);
  const nextIngredients = recipe.ingredients.map((ing) => {
    if (!ing.name) return ing;
    const matches = findAllergensInIngredient(ing.name, [tag]);
    if (matches.length === 0) return ing;
    const flags = new Set<AllergenTag>(ing.allergenFlags ?? []);
    if (flags.has(tag)) return ing;
    flags.add(tag);
    return { ...ing, allergenFlags: Array.from(flags) };
  });
  return {
    ...recipe,
    ingredients: nextIngredients,
    analysis: { ...(recipe.analysis ?? {}), allergens: Array.from(declared) },
  };
}

/**
 * Recipe-level REMOVE (post audit-modal): the chef removed the allergen at
 * recipe level. Cascade: remove from `analysis.allergens` AND from every
 * ingredient's `allergenFlags`. The audit row is recorded BEFORE this is
 * called (Rule 12 — fail loud).
 */
export function applyRecipeAllergenRemove(recipe: Recipe, tag: AllergenTag): Recipe {
  const declared = (recipe.analysis?.allergens ?? []).filter((a) => a !== tag);
  const nextIngredients = recipe.ingredients.map((ing) => {
    const flags = ing.allergenFlags;
    if (!flags || !flags.includes(tag)) return ing;
    const stripped = flags.filter((a) => a !== tag);
    return { ...ing, allergenFlags: stripped.length > 0 ? stripped : undefined };
  });
  return {
    ...recipe,
    ingredients: nextIngredients,
    analysis: { ...(recipe.analysis ?? {}), allergens: declared },
  };
}

/**
 * Ingredient-level ADD: the chef flagged an allergen on one ingredient row.
 * Add it to that ingredient's `allergenFlags` AND promote it to
 * `analysis.allergens` if not already present — so the recipe-level pill row
 * + the library card immediately reflect the new safety signal.
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
 * Ingredient-level REMOVE (post per-ingredient confirm-modal in IngredientRow):
 * remove from that ingredient's `allergenFlags`. THEN: if no OTHER ingredient
 * still carries this tag (neither in `allergenFlags` nor via regex auto-match
 * against the ingredient name), also de-promote from `analysis.allergens` so
 * the recipe-level pill disappears.
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
  // After the per-ingredient removal, check if ANY remaining ingredient
  // still carries this allergen (manual flag OR regex auto-match against
  // the current declared set MINUS the tag we're considering removing).
  const anyOtherSource = nextIngredients.some((ing) => {
    if (ing.allergenFlags?.includes(tag)) return true;
    if (ing.name && findAllergensInIngredient(ing.name, [tag]).includes(tag)) return true;
    return false;
  });
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
 * Effective allergen list for display purposes: union of the recipe-level
 * `analysis.allergens` (set by AI or the editor's tag input) and every
 * `ingredient.allergenFlags` (manual per-ingredient overrides). Sorted
 * stable-alphabetically so the library card and editor render in the same
 * order regardless of insertion sequence.
 *
 * NOT persisted — computed at read time so a future re-run of the AI
 * analyzer can independently refresh `analysis.allergens` without clobbering
 * the chef's manual flags.
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
