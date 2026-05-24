import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest, type Env } from './index';

// In-memory KV mock (matches the one in rateLimit.test.ts).
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

// AI mock that records the model + returns a canned JSON string.
function makeAi(captured: { calls: number; model?: string } = { calls: 0 }): Ai {
  return {
    run: vi.fn(async (model: string) => {
      captured.calls += 1;
      captured.model = model;
      return { response: '{"title":"x"}' };
    }),
  } as unknown as Ai;
}

function makeD1Stub(): D1Database {
  // Not exercised by the LLM-route tests below; sync.test.ts has its own
  // richer stub. A throwing stub would catch any accidental D1 access here.
  return {
    prepare() {
      throw new Error('D1 not stubbed for this test');
    },
  } as unknown as D1Database;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI: makeAi(),
    RATE_LIMIT: makeKv(),
    DB: makeD1Stub(),
    CLERK_ISSUER: 'https://example.clerk.accounts.dev',
    CLERK_SECRET_KEY: 'sk_test_fake',
    DAILY_LIMIT: '3', // small so the 429 test runs fast
    ...overrides,
  };
}

const verifyAccepts = (userId: string) =>
  vi.fn(async () => ({ sub: userId }));
const verifyRejects = vi.fn(async () => { throw new Error('bad token'); });

function authedReq(path: string, body: unknown = { systemPrompt: 'S', userPrompt: 'U' }): Request {
  return new Request(`https://api.test${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fake.jwt.token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let env: Env;

beforeEach(() => {
  env = makeEnv();
});

describe('worker router', () => {
  it('404 for non-/api/llm paths', async () => {
    const res = await handleRequest(new Request('https://api.test/'), env, verifyAccepts('user_a'));
    expect(res.status).toBe(404);
  });

  it('401 when Authorization header is missing', async () => {
    const req = new Request('https://api.test/api/llm/generate', { method: 'POST' });
    const res = await handleRequest(req, env, verifyAccepts('user_a'));
    expect(res.status).toBe(401);
  });

  it('401 when token verification fails', async () => {
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyRejects);
    expect(res.status).toBe(401);
  });

  it('200 + JSON content on a valid generate call', async () => {
    const res = await handleRequest(authedReq('/api/llm/generate'), env, verifyAccepts('user_a'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { content: string };
    expect(json.content).toBe('{"title":"x"}');
  });

  it('404 on an unknown /api/llm endpoint', async () => {
    const res = await handleRequest(authedReq('/api/llm/nope'), env, verifyAccepts('user_a'));
    expect(res.status).toBe(404);
  });

  it('400 when the request body is not JSON', async () => {
    const req = new Request('https://api.test/api/llm/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer fake.jwt.token', 'Content-Type': 'application/json' },
      body: 'not-json{',
    });
    const res = await handleRequest(req, env, verifyAccepts('user_a'));
    expect(res.status).toBe(400);
  });

  it('400 when systemPrompt is missing', async () => {
    const res = await handleRequest(
      authedReq('/api/llm/generate', { userPrompt: 'only user prompt' }),
      env,
      verifyAccepts('user_a'),
    );
    expect(res.status).toBe(400);
  });

  it('429 with Retry-After after exceeding the daily limit', async () => {
    const verify = verifyAccepts('user_a');
    // DAILY_LIMIT=3 in makeEnv
    for (let i = 0; i < 3; i++) {
      const ok = await handleRequest(authedReq('/api/llm/generate'), env, verify);
      expect(ok.status).toBe(200);
    }
    const limited = await handleRequest(authedReq('/api/llm/generate'), env, verify);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('200 on GET /api/health without auth', async () => {
    // Pass a fresh verifier that would throw if called — the 200 below is
    // proof that the route bypasses auth (otherwise the throw would 500).
    const wouldThrow = vi.fn(async () => { throw new Error('should not be called'); });
    const req = new Request('https://api.test/api/health', { method: 'GET' });
    const res = await handleRequest(req, makeEnv(), wouldThrow);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('chefflow-llm-proxy');
    expect(wouldThrow).not.toHaveBeenCalled();
  });

  it('405 on POST /api/health', async () => {
    const req = new Request('https://api.test/api/health', { method: 'POST' });
    const res = await handleRequest(req, makeEnv(), verifyRejects);
    expect(res.status).toBe(405);
  });

  it('204 on OPTIONS with CORS headers', async () => {
    const res = await handleRequest(
      new Request('https://api.test/api/llm/generate', { method: 'OPTIONS' }),
      env,
      verifyAccepts('user_a'),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});
