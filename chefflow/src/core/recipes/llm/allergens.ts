// ---------------------------------------------------------------------------
// UK Top-14 declared food allergens — the closed taxonomy ChefFlow ships with.
//
// UK food law requires food businesses to declare these 14 allergens. The tag
// keys are kebab-case so they survive JSON / IndexedDB round-trips. Display
// labels + example sources are kept beside the tags so the prompt builder and
// the UI badge component pull from one source of truth.
// ---------------------------------------------------------------------------

import type { AllergenTag } from '../../types';

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
