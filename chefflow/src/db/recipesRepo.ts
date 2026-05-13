import { db } from './dexie';
import type { Recipe } from '../core/types';

export async function listRecipes(): Promise<Recipe[]> {
  const all = await db.recipes.orderBy('updatedAt').reverse().toArray();
  return all.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id);
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe);
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}
