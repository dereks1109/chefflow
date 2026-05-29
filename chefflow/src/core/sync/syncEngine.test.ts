import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collectPending } from './syncEngine';
import { db } from '../../db/dexie';
import * as authMod from '../auth/getCurrentUserId';
import type { Recipe } from '../types';

beforeEach(async () => {
  await db.recipes.clear();
  await db.events.clear();
  vi.spyOn(authMod, 'getCurrentUserId').mockReturnValue('user_viewer');
});

function recipeRow(id: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    userId: 'user_viewer',
    title: id,
    originalYield: 1,
    ingredients: [],
    steps: [],
    createdAt: 0,
    updatedAt: 100,
    synced: false,
    ...overrides,
  } as unknown as Recipe;
}

describe('collectPending — T3c Phase 3 read-only push filter', () => {
  // Why this matters: a member viewing an Enterprise owner's recipe must
  // never push it back to the server. Pushing would stamp the row with the
  // viewer's userId (the worker takes userId from JWT), creating a forked
  // duplicate that diverges from the owner's authoritative copy. The
  // SPA-side filter here is the primary guard; any local accidental edit
  // (a future regression in the UI gates) becomes a silent fork without
  // this filter.

  it('SKIPS rows where readOnly === true even if synced=false (shared rows never push)', async () => {
    await db.recipes.put(recipeRow('r_own_pending', { synced: false }));
    await db.recipes.put(recipeRow('r_shared', {
      synced: false,
      ownerUserId: 'user_owner',
      readOnly: true,
    }));

    const body = await collectPending();

    expect(body.recipes).toBeDefined();
    expect(body.recipes!.map((r) => r.id)).toEqual(['r_own_pending']);
  });

  it('INCLUDES the viewer\'s own unsynced rows (regression sentinel — filter mustn\'t over-reach)', async () => {
    await db.recipes.put(recipeRow('r1', { synced: false }));
    await db.recipes.put(recipeRow('r2', { synced: false }));

    const body = await collectPending();
    expect(body.recipes!.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('SKIPS already-synced own rows (existing behaviour — kept for regression)', async () => {
    await db.recipes.put(recipeRow('r_clean', { synced: true }));
    await db.recipes.put(recipeRow('r_dirty', { synced: false }));

    const body = await collectPending();
    expect(body.recipes!.map((r) => r.id)).toEqual(['r_dirty']);
  });
});
