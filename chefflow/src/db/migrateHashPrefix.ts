// One-shot Dexie migration: rewrite the sub-recipe link sigil from `#` to
// `@`. Earlier versions of ChefFlow used `#` as the prefix on ingredient
// names that linked to another recipe (`name: "#(Demo) Black Pepper Sauce"`);
// we've moved to `@` because `#` is more commonly read as a hashtag /
// section marker, and `@` reads cleanly as "at this recipe".
//
// Runs once per browser. Idempotent on a localStorage flag so re-mounts +
// the SyncRunner's pulls don't re-run it.

import { db } from './dexie';
import type { Ingredient, Recipe } from '../core/types';

const FLAG = 'chefflow:migrated-hash-to-at-v1';

interface Result {
  migrated: number;
}

export async function migrateHashToAt(): Promise<Result> {
  if (typeof window === 'undefined') return { migrated: 0 };
  if (window.localStorage.getItem(FLAG) === '1') return { migrated: 0 };

  const all = await db.recipes.toArray();
  let migrated = 0;
  for (const recipe of all) {
    const next = withRewrittenIngredients(recipe);
    if (next !== recipe) {
      // updatedAt is intentionally NOT bumped — this is a transparent
      // sigil rewrite, not a user-visible edit. Sync engine will still
      // push the row on its next round because the in-memory `synced`
      // flag is unset (see `recipesRepo.saveRecipe`); we go around that
      // by using db.recipes.put directly to avoid stamping a new
      // updatedAt over the chef's last real edit.
      await db.recipes.put({ ...next, synced: false });
      migrated++;
    }
  }
  window.localStorage.setItem(FLAG, '1');
  return { migrated };
}

function withRewrittenIngredients(recipe: Recipe): Recipe {
  let touched = false;
  const nextIngredients: Ingredient[] = recipe.ingredients.map((ing) => {
    if (!ing.componentRecipeId) return ing;
    if (!ing.name.startsWith('#')) return ing;
    touched = true;
    const newName = `@${ing.name.slice(1)}`;
    return {
      ...ing,
      name: newName,
      // The `raw` field encodes the same name as part of `{amount|unit|name}`
      // — re-derive it to keep the two in sync.
      raw: `{${ing.amount}|${ing.unit}|${newName}}`,
    };
  });
  return touched ? { ...recipe, ingredients: nextIngredients } : recipe;
}
