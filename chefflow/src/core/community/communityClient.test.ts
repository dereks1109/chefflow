import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  publishRecipe,
  unpublishRecipe,
  listCommunityRecipes,
  getCommunityRecipe,
  toggleLike,
  recordCopy,
  CommunityClientError,
} from './communityClient';
import type { Recipe } from '../types';

function stubClerk(token: string | null) {
  (window as unknown as { Clerk?: unknown }).Clerk = token
    ? { session: { getToken: vi.fn(async () => token) } }
    : { session: null };
}

function sampleRecipe(): Recipe {
  return {
    id: 'r_local_1',
    title: 'Demo',
    originalYield: 4,
    ingredients: [],
    steps: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  stubClerk('fake.jwt.token');
});

describe('publishRecipe', () => {
  it('POSTs /community/publish with bearer JWT + recipe + displayName', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fetchImpl: typeof fetch = vi.fn(async (u, i) => {
      url = String(u);
      init = i;
      return new Response(JSON.stringify({ id: 'cr_new' }), { status: 200 });
    });
    const out = await publishRecipe(sampleRecipe(), 'Alice', { fetchImpl });
    expect(url).toBe('/community/publish');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer fake.jwt.token');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      recipe: { id: 'r_local_1', title: 'Demo', originalYield: 4 },
      displayName: 'Alice',
    });
    expect(out).toEqual({ id: 'cr_new' });
  });

  it('throws CommunityClientError(401) when signed out', async () => {
    stubClerk(null);
    const fetchImpl = vi.fn();
    await expect(publishRecipe(sampleRecipe(), 'Alice', { fetchImpl })).rejects.toBeInstanceOf(CommunityClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('unpublishRecipe', () => {
  it('DELETEs /community/:id with bearer JWT', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fetchImpl: typeof fetch = vi.fn(async (u, i) => {
      url = String(u);
      init = i;
      return new Response('{}', { status: 200 });
    });
    await unpublishRecipe('cr_abc', { fetchImpl });
    expect(url).toBe('/community/cr_abc');
    expect(init?.method).toBe('DELETE');
  });
});

describe('listCommunityRecipes', () => {
  it('GETs /community/list without auth and returns items', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: 'cr_a', title: 'X', authorDisplayName: 'Alice', likes: 2, copies: 1, publishedAt: 0 }] }), { status: 200 }),
    );
    const out = await listCommunityRecipes({ fetchImpl });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'cr_a', title: 'X', likes: 2, copies: 1 });
  });
});

describe('getCommunityRecipe', () => {
  it('returns null on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const out = await getCommunityRecipe('cr_nope', { fetchImpl });
    expect(out).toBeNull();
  });

  it('returns parsed body on 200', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'cr_a', title: 'X', originalYield: 2, ingredients: [], steps: [], authorClerkId: 'u', authorDisplayName: 'Alice', publishedAt: 0, likes: 0, copies: 0 }), { status: 200 }),
    );
    const out = await getCommunityRecipe('cr_a', { fetchImpl });
    expect(out).not.toBeNull();
    expect(out!.title).toBe('X');
  });
});

describe('toggleLike + recordCopy', () => {
  it('toggleLike POSTs /community/:id/like with bearer JWT', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fetchImpl: typeof fetch = vi.fn(async (u, i) => {
      url = String(u);
      init = i;
      return new Response(JSON.stringify({ liked: true, likes: 3 }), { status: 200 });
    });
    const out = await toggleLike('cr_x', { fetchImpl });
    expect(url).toBe('/community/cr_x/like');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer fake.jwt.token');
    expect(out).toEqual({ liked: true, likes: 3 });
  });

  it('recordCopy POSTs /community/:id/copy', async () => {
    let url = '';
    const fetchImpl: typeof fetch = vi.fn(async (u) => {
      url = String(u);
      return new Response(JSON.stringify({ copies: 5 }), { status: 200 });
    });
    const out = await recordCopy('cr_x', { fetchImpl });
    expect(url).toBe('/community/cr_x/copy');
    expect(out).toEqual({ copies: 5 });
  });
});
