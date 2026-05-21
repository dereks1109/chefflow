import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest, type Env } from './index';
import type { FetchLike } from './tier';

// In-memory KV mock (same shape used elsewhere in this package).
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() {
      return { keys: Array.from(store.keys()).map((name) => ({ name })), list_complete: true, cacheStatus: null };
    },
  } as unknown as KVNamespace;
}

function makeAi(captured: { calls: number; model?: string } = { calls: 0 }): Ai {
  return {
    run: vi.fn(async (model: string) => {
      captured.calls += 1;
      captured.model = model;
      return { response: '{"title":"x"}' };
    }),
  } as unknown as Ai;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI: makeAi(),
    RATE_LIMIT: makeKv(),
    CLERK_ISSUER: 'https://example.clerk.accounts.dev',
    CLERK_SECRET_KEY: 'sk_test_fake',
    DAILY_LIMIT: '30', // legacy; unused after tier migration
    STRIPE_SECRET_KEY: 'sk_test_stripe',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    STRIPE_PRICE_ID_PRO_MONTHLY: 'price_m',
    STRIPE_PRICE_ID_PRO_ANNUAL: 'price_y',
    ...overrides,
  };
}

const verifyAccepts = (userId: string) =>
  vi.fn(async () => ({ sub: userId }));
const verifyRejects = vi.fn(async () => { throw new Error('bad token'); });

// Stub Clerk Backend API. By default returns publicMetadata.tier per `tier` arg.
function stubFetchClerkTier(tier: 'free' | 'pro' | 'business'): FetchLike {
  return vi.fn(async (url: string) => {
    if (url.startsWith('https://api.clerk.com/v1/users/')) {
      return new Response(JSON.stringify({ public_metadata: { tier } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not stubbed', { status: 500 });
  });
}

function authedReq(path: string, body: unknown = { systemPrompt: 'S', userPrompt: 'U' }, method = 'POST'): Request {
  const init: RequestInit = {
    method,
    headers: { Authorization: 'Bearer fake.jwt.token', 'Content-Type': 'application/json' },
  };
  if (method !== 'GET') init.body = JSON.stringify(body);
  return new Request(`https://api.test${path}`, init);
}

let env: Env;

beforeEach(() => {
  env = makeEnv();
});

describe('worker router — auth', () => {
  it('401 when Authorization header is missing', async () => {
    const req = new Request('https://api.test/api/llm/generate', { method: 'POST' });
    const res = await handleRequest(req, env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(401);
  });

  it('401 when token verification fails', async () => {
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyRejects, stubFetchClerkTier('free'));
    expect(res.status).toBe(401);
  });

  it('204 on OPTIONS with CORS headers', async () => {
    const res = await handleRequest(
      new Request('https://api.test/api/llm/generate', { method: 'OPTIONS' }),
      env,
      verifyAccepts('user_a'),
      stubFetchClerkTier('free'),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('404 for unknown paths', async () => {
    const res = await handleRequest(new Request('https://api.test/', { method: 'GET' }), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    // Auth happens before routing, so unauthed → 401. Add header to reach 404.
    const authed = await handleRequest(authedReq('/nope', undefined, 'GET'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(authed.status).toBe(404);
    // Original assertion: GET without auth returns 401.
    expect(res.status).toBe(401);
  });
});

describe('worker router — /api/llm/* (tier-aware LLM cap)', () => {
  it('200 + JSON content on a valid generate call (free user, under cap)', async () => {
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string };
    expect(body.content).toBe('{"title":"x"}');
  });

  it('404 on an unknown /api/llm endpoint', async () => {
    const res = await handleRequest(authedReq('/api/llm/nope'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(404);
  });

  it('400 when systemPrompt is missing', async () => {
    const res = await handleRequest(
      authedReq('/api/llm/generate', { userPrompt: 'only user prompt' }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    expect(res.status).toBe(400);
  });

  it('429 when free user exceeds their 10-call daily LLM cap', async () => {
    // Pre-populate the KV counter for today so we cap on the next call.
    const today = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`q:llm:user_a:${today}`, '10');
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    const body = (await res.json()) as { kind: string };
    expect(body.kind).toBe('llm');
  });

  it('pro users get a higher cap (51st call still 429s, 11th does not)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`q:llm:user_a:${today}`, '10');
    // Pro cap is 50 — 11th call goes through.
    const ok = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'), stubFetchClerkTier('pro'));
    expect(ok.status).toBe(200);
    // Now drive it past 50.
    await env.RATE_LIMIT.put(`q:llm:user_a:${today}`, '50');
    const capped = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'), stubFetchClerkTier('pro'));
    expect(capped.status).toBe(429);
  });

  it('business users bypass LLM cap (unlimited)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`q:llm:user_a:${today}`, '999');
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'), stubFetchClerkTier('business'));
    expect(res.status).toBe(200);
  });
});

describe('worker router — POST /quota/consume', () => {
  it('200 + {allowed, count, remaining} on first call', async () => {
    const res = await handleRequest(
      authedReq('/quota/consume', { kind: 'recipe' }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allowed: boolean; count: number; remaining: number };
    expect(body.allowed).toBe(true);
    expect(body.count).toBe(1);
    expect(body.remaining).toBe(4); // free recipe cap 5
  });

  it('400 when body kind is missing or invalid', async () => {
    const r1 = await handleRequest(authedReq('/quota/consume', {}), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(r1.status).toBe(400);
    const r2 = await handleRequest(authedReq('/quota/consume', { kind: 'seats' }), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(r2.status).toBe(400);
  });

  it('429 with kind=recipe when free user exceeds 5 recipes/day', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`q:recipe:user_a:${today}`, '5');
    const res = await handleRequest(
      authedReq('/quota/consume', { kind: 'recipe' }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { kind: string };
    expect(body.kind).toBe('recipe');
  });

  it('pro user gets remaining=null (unlimited)', async () => {
    const res = await handleRequest(
      authedReq('/quota/consume', { kind: 'recipe' }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('pro'),
    );
    const body = (await res.json()) as { allowed: boolean; remaining: number | null };
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(null); // Infinity → null in JSON
  });
});

describe('worker router — community', () => {
  it('GET /community/list is public (no auth required)', async () => {
    const req = new Request('https://api.test/community/list', { method: 'GET' });
    const res = await handleRequest(req, env, verifyRejects, stubFetchClerkTier('free'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('POST /community/publish requires auth', async () => {
    const req = new Request('https://api.test/community/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: { title: 'X', originalYield: 2, ingredients: [], steps: [] } }),
    });
    const res = await handleRequest(req, env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(401);
  });

  it('publish → list round-trip exposes the recipe with author + counters', async () => {
    const pub = await handleRequest(
      authedReq('/community/publish', {
        recipe: { id: 'r_local_1', title: 'Demo', originalYield: 2, ingredients: [], steps: [] },
        displayName: 'Alice',
      }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    expect(pub.status).toBe(200);
    const { id } = (await pub.json()) as { id: string };
    expect(id.startsWith('cr_')).toBe(true);

    const list = await handleRequest(
      new Request('https://api.test/community/list', { method: 'GET' }),
      env, verifyRejects, stubFetchClerkTier('free'),
    );
    const { items } = (await list.json()) as { items: Array<{ id: string; title: string; authorDisplayName: string; likes: number; copies: number }> };
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, title: 'Demo', authorDisplayName: 'Alice', likes: 0, copies: 0 });
  });

  it('POST /community/:id/like toggles and DELETE requires the author', async () => {
    const pub = await handleRequest(
      authedReq('/community/publish', {
        recipe: { id: 'r_local_1', title: 'Demo', originalYield: 2, ingredients: [], steps: [] },
        displayName: 'Alice',
      }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    const { id } = (await pub.json()) as { id: string };

    // Different user likes it.
    const liked = await handleRequest(
      authedReq(`/community/${id}/like`, {}),
      env, verifyAccepts('user_b'), stubFetchClerkTier('free'),
    );
    expect(liked.status).toBe(200);
    expect((await liked.json()) as { liked: boolean; likes: number }).toEqual({ liked: true, likes: 1 });

    // Non-author tries to delete → 403.
    const forbidden = await handleRequest(
      authedReq(`/community/${id}`, undefined, 'DELETE'),
      env, verifyAccepts('user_b'), stubFetchClerkTier('free'),
    );
    expect(forbidden.status).toBe(403);

    // Author deletes → 200.
    const ok = await handleRequest(
      authedReq(`/community/${id}`, undefined, 'DELETE'),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    expect(ok.status).toBe(200);
  });

  it('POST /community/:id/copy increments and 404s for unknown ids', async () => {
    const pub = await handleRequest(
      authedReq('/community/publish', {
        recipe: { id: 'r_local_1', title: 'Demo', originalYield: 2, ingredients: [], steps: [] },
        displayName: 'Alice',
      }),
      env, verifyAccepts('user_a'), stubFetchClerkTier('free'),
    );
    const { id } = (await pub.json()) as { id: string };

    const c1 = await handleRequest(
      authedReq(`/community/${id}/copy`, {}),
      env, verifyAccepts('user_b'), stubFetchClerkTier('free'),
    );
    expect(c1.status).toBe(200);
    expect((await c1.json()) as { copies: number }).toEqual({ copies: 1 });

    const c2 = await handleRequest(
      authedReq(`/community/cr_unknown_id/copy`, {}),
      env, verifyAccepts('user_b'), stubFetchClerkTier('free'),
    );
    expect(c2.status).toBe(404);
  });
});

describe('worker router — GET /quota/snapshot', () => {
  it('returns counts for all three kinds + tier', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`q:recipe:user_a:${today}`, '3');
    await env.RATE_LIMIT.put(`q:event:user_a:${today}`, '1');
    const res = await handleRequest(authedReq('/quota/snapshot', undefined, 'GET'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tier: string;
      quotas: Record<string, { count: number; remaining: number | null; limit: number }>;
    };
    expect(body.tier).toBe('free');
    expect(body.quotas.recipe).toEqual({ count: 3, remaining: 2, limit: 5 });
    expect(body.quotas.event).toEqual({ count: 1, remaining: 0, limit: 1 });
    expect(body.quotas.llm).toEqual({ count: 0, remaining: 10, limit: 10 });
  });

  it('snapshot does not increment the counter', async () => {
    await handleRequest(authedReq('/quota/snapshot', undefined, 'GET'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    await handleRequest(authedReq('/quota/snapshot', undefined, 'GET'), env, verifyAccepts('user_a'), stubFetchClerkTier('free'));
    const today = new Date().toISOString().slice(0, 10);
    expect(await env.RATE_LIMIT.get(`q:recipe:user_a:${today}`)).toBe(null);
  });
});
