import { describe, it, expect } from 'vitest';
import { findAllergensInIngredient } from './allergens';

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
