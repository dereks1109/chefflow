import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from './dexie';
import { syncNow } from './syncClient';
import { setCurrentUserId } from '../state/currentUser';
import { useSyncStore } from '../state/syncStore';
import type { Recipe } from '../core/types';

const USER = 'user_sync_test';

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_sync_001',
    title: 'Sync Test',
    originalYield: 2,
    ingredients: [],
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
    ownerId: USER,
    dirty: true,
    serverVersion: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.recipes.clear();
  await db.events.clear();
  setCurrentUserId(USER);
  useSyncStore.setState({ status: 'idle', lastSyncedAt: null, pendingCount: 0, lastError: null });
});

describe('syncClient.syncNow', () => {
  it('pushes only dirty rows, then pulls deltas', async () => {
    await db.recipes.put(makeRecipe({ id: 'dirty', updatedAt: 2000, dirty: true }));
    await db.recipes.put(makeRecipe({ id: 'clean', updatedAt: 1500, dirty: false, serverVersion: 100 }));

    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url.includes('/api/sync/push')) {
        return new Response(JSON.stringify({
          recipes: { dirty: 5000 },
          events: {},
          serverNow: 5000,
        }), { status: 200 });
      }
      // pull
      return new Response(JSON.stringify({ recipes: [], events: [], serverNow: 5000 }), { status: 200 });
    });

    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });

    // Two HTTP calls: push then pull.
    expect(calls.map((c) => c.url)).toEqual([
      expect.stringContaining('/api/sync/push'),
      expect.stringContaining('/api/sync/pull'),
    ]);
    // Push body includes only the dirty row.
    const pushBody = calls[0].body as { recipes: Recipe[]; events: Recipe[] };
    expect(pushBody.recipes).toHaveLength(1);
    expect(pushBody.recipes[0].id).toBe('dirty');

    // The dirty row got serverVersion stamped and dirty=false.
    const after = await db.recipes.get('dirty');
    expect(after?.serverVersion).toBe(5000);
    expect(after?.dirty).toBe(false);

    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().lastSyncedAt).toBeGreaterThan(0);
  });

  it('pull applies incoming rows when local is older', async () => {
    await db.recipes.put(makeRecipe({
      id: 'r1', updatedAt: 1000, dirty: false, serverVersion: 100, title: 'old',
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/sync/push')) {
        return new Response(JSON.stringify({ recipes: {}, events: {}, serverNow: 200 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        recipes: [{
          id: 'r1',
          updatedAt: 2000,
          serverVersion: 200,
          deletedAt: null,
          payload: { ...makeRecipe({ id: 'r1', updatedAt: 2000, title: 'newer' }), dirty: false },
        }],
        events: [],
        serverNow: 200,
      }), { status: 200 });
    });

    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });

    const r = await db.recipes.get('r1');
    expect(r?.title).toBe('newer');
    expect(r?.serverVersion).toBe(200);
    expect(r?.dirty).toBe(false);
  });

  it('pull does NOT clobber a row whose local updatedAt is newer (LWW)', async () => {
    await db.recipes.put(makeRecipe({
      id: 'r1', updatedAt: 3000, dirty: true, serverVersion: 100, title: 'local edit',
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/sync/push')) {
        // Server rejects the push (lww kept stored row); pretend we already pushed once.
        return new Response(JSON.stringify({ recipes: { r1: null }, events: {}, serverNow: 200 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        recipes: [{
          id: 'r1',
          updatedAt: 2000, // older than local 3000
          serverVersion: 200,
          deletedAt: null,
          payload: { ...makeRecipe({ id: 'r1', updatedAt: 2000, title: 'server old' }), dirty: false },
        }],
        events: [],
        serverNow: 200,
      }), { status: 200 });
    });

    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });

    const r = await db.recipes.get('r1');
    expect(r?.title).toBe('local edit');
    expect(r?.updatedAt).toBe(3000);
  });

  it('pull tombstone hard-deletes the local row', async () => {
    await db.recipes.put(makeRecipe({
      id: 'r1', updatedAt: 1000, dirty: false, serverVersion: 100,
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/sync/push')) {
        return new Response(JSON.stringify({ recipes: {}, events: {}, serverNow: 200 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        recipes: [{
          id: 'r1',
          updatedAt: 2000,
          serverVersion: 200,
          deletedAt: 2000,
          payload: { id: 'r1' },
        }],
        events: [],
        serverNow: 200,
      }), { status: 200 });
    });

    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });

    expect(await db.recipes.get('r1')).toBeUndefined();
  });

  it('marks store offline on network failure (does not lose dirty)', async () => {
    await db.recipes.put(makeRecipe({ id: 'r1', dirty: true }));

    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });

    expect(useSyncStore.getState().status).toBe('offline');
    const r = await db.recipes.get('r1');
    expect(r?.dirty).toBe(true);
  });

  it('is a no-op when no user is signed in', async () => {
    setCurrentUserId(null);
    const fetchMock = vi.fn();
    await syncNow({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => 'fake-token',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
