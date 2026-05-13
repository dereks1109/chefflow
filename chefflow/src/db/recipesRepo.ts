import { db } from './dexie';
import type { Recipe } from '../core/types';

export async function listRecipes(): Promise<Recipe[]> {
  return db.recipes.orderBy('updatedAt').reverse().toArray();
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
