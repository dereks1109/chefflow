import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listRecipes, getRecipe, saveRecipe, deleteRecipe } from './recipesRepo';
import type { Recipe } from '../core/types';

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_test_001',
    title: 'Test Recipe',
    originalYield: 4,
    ingredients: [],
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.recipes.clear();
});

describe('recipesRepo', () => {
  it('saves and retrieves a recipe', async () => {
    const r = makeRecipe();
    await saveRecipe(r);
    const got = await getRecipe('r_test_001');
    expect(got?.title).toBe('Test Recipe');
  });

  it('returns undefined for unknown id', async () => {
    expect(await getRecipe('nope')).toBeUndefined();
  });

  it('listRecipes returns all saved recipes sorted by updatedAt desc', async () => {
    await saveRecipe(makeRecipe({ id: 'a', title: 'A', updatedAt: 100 }));
    await saveRecipe(makeRecipe({ id: 'b', title: 'B', updatedAt: 300 }));
    await saveRecipe(makeRecipe({ id: 'c', title: 'C', updatedAt: 200 }));
    const all = await listRecipes();
    expect(all.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('saveRecipe updates an existing record', async () => {
    await saveRecipe(makeRecipe({ title: 'V1' }));
    await saveRecipe(makeRecipe({ title: 'V2' }));
    const all = await listRecipes();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteRecipe removes the record', async () => {
    await saveRecipe(makeRecipe());
    await deleteRecipe('r_test_001');
    expect(await getRecipe('r_test_001')).toBeUndefined();
  });

  it('listRecipes places pinned recipes first, then by updatedAt desc within each group', async () => {
    await saveRecipe(makeRecipe({ id: 'a', title: 'A', updatedAt: 100 }));
    await saveRecipe(makeRecipe({ id: 'b', title: 'B', updatedAt: 300 }));
    await saveRecipe(makeRecipe({ id: 'c', title: 'C', updatedAt: 200, isPinned: true }));
    await saveRecipe(makeRecipe({ id: 'd', title: 'D', updatedAt: 50, isPinned: true }));
    const all = await listRecipes();
    expect(all.map(r => r.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});
