import { describe, it, expect, beforeEach } from 'vitest';
import { isLocalDbEmptyForUser } from './SyncRunner';
import { db } from '../../db/dexie';
import type { Recipe, KitchenEvent } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
  await db.events.clear();
});

function fakeRecipe(userId: string): Recipe {
  return {
    id: `r_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    title: 'Test',
    originalYield: 1,
    ingredients: [],
    steps: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Recipe;
}

function fakeEvent(userId: string): KitchenEvent {
  return {
    id: `e_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    title: 'Test',
    notes: '',
    dishes: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as KitchenEvent;
}

describe('isLocalDbEmptyForUser', () => {
  // Why this matters: a `true` return triggers force-reprovisioning of
  // demo content on login (un-tombstones server-side deletes). A `false`
  // return leaves intentional deletes sticky. Getting this wrong either
  // resurrects deleted demos every login (annoying) or never restores
  // them on a fresh device (broken first-run UX). Test pins both branches.
  it('returns true when the user has zero recipes AND zero events (fresh device or cleared site data)', async () => {
    expect(await isLocalDbEmptyForUser('user_alice')).toBe(true);
  });

  it('returns false when the user has at least one recipe (intentional deletes should stick)', async () => {
    await db.recipes.put(fakeRecipe('user_alice'));
    expect(await isLocalDbEmptyForUser('user_alice')).toBe(false);
  });

  it('returns false when the user has at least one event (chef populated their own content)', async () => {
    await db.events.put(fakeEvent('user_alice'));
    expect(await isLocalDbEmptyForUser('user_alice')).toBe(false);
  });

  it('scopes the check per-user — another userId\'s rows do NOT count toward this user\'s emptiness', async () => {
    await db.recipes.put(fakeRecipe('user_bob'));
    await db.events.put(fakeEvent('user_bob'));
    expect(await isLocalDbEmptyForUser('user_alice')).toBe(true);
  });
});
