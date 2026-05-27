import type { Recipe } from '../types';
import { getRecipeAllergenList } from '../recipes/recipeShape';

export function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return recipes;
  return recipes.filter((r) => matchesRecipe(r, needle));
}

export function filterRecipesByMenu(
  recipes: Recipe[],
  recipeIds: readonly string[]
): Recipe[] {
  const allowed = new Set(recipeIds);
  return recipes.filter((r) => allowed.has(r.id));
}

function matchesRecipe(recipe: Recipe, needle: string): boolean {
  if (recipe.title && recipe.title.toLowerCase().includes(needle)) return true;
  for (const ing of recipe.ingredients) {
    if (ing.name && ing.name.toLowerCase().includes(needle)) return true;
  }
  for (const a of getRecipeAllergenList(recipe)) {
    if (a.toLowerCase().includes(needle)) return true;
  }
  return false;
}
