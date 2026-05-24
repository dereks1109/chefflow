import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listRecipes, getRecipe, saveRecipe, deleteRecipe } from './recipesRepo';
import { setCurrentUserId } from '../state/currentUser';
import type { Recipe } from '../core/types';

const TEST_USER = 'user_test_001';

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_test_001',
    title: 'Test Recipe',
    originalYield: 4,
    ingredients: [],
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
    ownerId: TEST_USER,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.recipes.clear();
  setCurrentUserId(TEST_USER);
});

describe('recipesRepo', () => {
  it('saves and retrieves a recipe', async () => {
    const r = makeRecipe();
    await saveRecipe(r);
    const got = await getRecipe('r_test_001');
    expect(got?.title).toBe('Test Recipe');
    expect(got?.ownerId).toBe(TEST_USER);
    expect(got?.dirty).toBe(true);
  });

  it('returns undefined for unknown id', async () => {
    expect(await getRecipe('nope')).toBeUndefined();
  });

  it('listRecipes returns all saved recipes sorted by updatedAt desc', async () => {
    await saveRecipe(makeRecipe({ id: 'a', title: 'A' }));
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipe(makeRecipe({ id: 'b', title: 'B' }));
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipe(makeRecipe({ id: 'c', title: 'C' }));
    const all = await listRecipes();
    expect(all.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('saveRecipe updates an existing record', async () => {
    await saveRecipe(makeRecipe({ title: 'V1' }));
    await saveRecipe(makeRecipe({ title: 'V2' }));
    const all = await listRecipes();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteRecipe soft-deletes the record (filtered from listing/get)', async () => {
    await saveRecipe(makeRecipe());
    await deleteRecipe('r_test_001');
    expect(await getRecipe('r_test_001')).toBeUndefined();
    expect(await listRecipes()).toEqual([]);
    // Row still exists in the raw table as a tombstone — for sync.
    const raw = await db.recipes.get('r_test_001');
    expect(raw?.deletedAt).toBeGreaterThan(0);
    expect(raw?.dirty).toBe(true);
  });

  it('listRecipes places pinned recipes first, then by updatedAt desc within each group', async () => {
    await saveRecipe(makeRecipe({ id: 'a', title: 'A' }));
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipe(makeRecipe({ id: 'b', title: 'B' }));
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipe(makeRecipe({ id: 'c', title: 'C', isPinned: true }));
    await new Promise((r) => setTimeout(r, 2));
    await saveRecipe(makeRecipe({ id: 'd', title: 'D', isPinned: true }));
    const all = await listRecipes();
    // d is newest pinned, then c, then b/a unpinned by recency
    expect(all.map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('isolates by ownerId — userA cannot see userB recipes', async () => {
    setCurrentUserId('userA');
    await saveRecipe(makeRecipe({ id: 'ra', ownerId: 'userA' }));
    setCurrentUserId('userB');
    await saveRecipe(makeRecipe({ id: 'rb', ownerId: 'userB' }));

    setCurrentUserId('userA');
    const aList = await listRecipes();
    expect(aList.map((r) => r.id)).toEqual(['ra']);
    expect(await getRecipe('rb')).toBeUndefined();

    setCurrentUserId('userB');
    const bList = await listRecipes();
    expect(bList.map((r) => r.id)).toEqual(['rb']);
    expect(await getRecipe('ra')).toBeUndefined();
  });

  it('saveRecipe stamps the current ownerId regardless of input ownerId', async () => {
    setCurrentUserId('userA');
    // Try to spoof another user via the input object — saveRecipe should
    // ignore the incoming ownerId and stamp the current user.
    await saveRecipe(makeRecipe({ id: 'r1', ownerId: 'userB' }));
    const r = await db.recipes.get('r1');
    expect(r?.ownerId).toBe('userA');
  });
});
