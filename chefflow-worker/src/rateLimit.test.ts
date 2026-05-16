import { describe, it, expect, beforeEach } from 'vitest';
import { consumeDailyQuota, RateLimitExceeded } from './rateLimit';

// Tiny in-memory KV mock — enough for these tests. The pool-workers package
// would have given us a real Miniflare KV, but that's broken on vitest 2.1
// (see chore commit dropping @cloudflare/vitest-pool-workers).
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return {
        keys: Array.from(store.keys()).map((name) => ({ name })),
        list_complete: true,
        cacheStatus: null,
      };
    },
  } as unknown as KVNamespace;
}

let kv: KVNamespace;

beforeEach(() => {
  kv = makeKv();
});

describe('consumeDailyQuota', () => {
  it('first call returns count=1 below the limit', async () => {
    const out = await consumeDailyQuota(kv, 'user_a', 5);
    expect(out.count).toBe(1);
    expect(out.remaining).toBe(4);
  });

  it('Nth call returns count=N until the limit', async () => {
    for (let i = 1; i <= 5; i++) {
      const out = await consumeDailyQuota(kv, 'user_a', 5);
      expect(out.count).toBe(i);
    }
  });

  it('throws RateLimitExceeded on the (limit+1)th call', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(kv, 'user_a', 5);
    }
    await expect(consumeDailyQuota(kv, 'user_a', 5))
      .rejects.toBeInstanceOf(RateLimitExceeded);
  });

  it('counts users independently', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(kv, 'user_a', 5);
    }
    const outB = await consumeDailyQuota(kv, 'user_b', 5);
    expect(outB.count).toBe(1);
  });

  it('exposes retryAfterSeconds on the error so the worker can set Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(kv, 'user_a', 5);
    }
    try {
      await consumeDailyQuota(kv, 'user_a', 5);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceeded);
      const r = (err as RateLimitExceeded).retryAfterSeconds;
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(26 * 60 * 60);
    }
  });
});
