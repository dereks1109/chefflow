import { describe, it, expect, beforeEach } from 'vitest';
import { consumeQuota, snapshotQuota, QuotaExceeded, isQuotaKind } from './quota';
import { UNLIMITED } from './limits';

// Same in-memory KV stub the legacy rateLimit tests used.
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
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

describe('consumeQuota', () => {
  it('returns count=1 / remaining=limit-1 on first call', async () => {
    const out = await consumeQuota(kv, 'user_a', 'recipe', 5);
    expect(out.count).toBe(1);
    expect(out.remaining).toBe(4);
  });

  it('increments across repeated calls', async () => {
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    const out = await consumeQuota(kv, 'user_a', 'recipe', 5);
    expect(out.count).toBe(3);
    expect(out.remaining).toBe(2);
  });

  it('throws QuotaExceeded when the next increment would breach the limit', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeQuota(kv, 'user_a', 'recipe', 5);
    }
    await expect(
      consumeQuota(kv, 'user_a', 'recipe', 5),
    ).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it('kinds are isolated — a recipe spend does not affect event quota', async () => {
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    const ev = await consumeQuota(kv, 'user_a', 'event', 1);
    // Event counter started at 0 for this kind; first event spend = 1
    expect(ev.count).toBe(1);
    expect(ev.remaining).toBe(0);
  });

  it('users are isolated — user_b is not affected by user_a spends', async () => {
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    const out = await consumeQuota(kv, 'user_b', 'recipe', 5);
    expect(out.count).toBe(1);
  });

  it('UNLIMITED short-circuits — no KV writes, infinite remaining', async () => {
    const out = await consumeQuota(kv, 'user_a', 'llm', UNLIMITED);
    expect(out.count).toBe(0);
    expect(out.remaining).toBe(Infinity);
    // Verify nothing was written.
    const snap = await snapshotQuota(kv, 'user_a', 'llm', 10);
    expect(snap.count).toBe(0);
  });

  it('resets at UTC midnight (different YYYY-MM-DD = different key)', async () => {
    const day1 = new Date('2026-05-20T23:59:59Z');
    const day2 = new Date('2026-05-21T00:00:01Z');
    for (let i = 0; i < 5; i++) {
      await consumeQuota(kv, 'user_a', 'recipe', 5, day1);
    }
    // Day 1 is at cap.
    await expect(
      consumeQuota(kv, 'user_a', 'recipe', 5, day1),
    ).rejects.toBeInstanceOf(QuotaExceeded);
    // Day 2 starts fresh.
    const out = await consumeQuota(kv, 'user_a', 'recipe', 5, day2);
    expect(out.count).toBe(1);
  });

  it('QuotaExceeded carries kind + a positive retryAfterSeconds', async () => {
    const noon = new Date('2026-05-20T12:00:00Z');
    await consumeQuota(kv, 'user_a', 'recipe', 1, noon);
    try {
      await consumeQuota(kv, 'user_a', 'recipe', 1, noon);
      expect.fail('expected QuotaExceeded');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceeded);
      const qe = err as QuotaExceeded;
      expect(qe.kind).toBe('recipe');
      // 12:00 UTC → midnight is 12 hours = 43200 seconds.
      expect(qe.retryAfterSeconds).toBe(12 * 60 * 60);
    }
  });
});

describe('snapshotQuota', () => {
  it('returns 0 when nothing has been consumed', async () => {
    const out = await snapshotQuota(kv, 'user_a', 'recipe', 5);
    expect(out).toEqual({ count: 0, remaining: 5 });
  });

  it('reads current count without incrementing', async () => {
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    await consumeQuota(kv, 'user_a', 'recipe', 5);
    const a = await snapshotQuota(kv, 'user_a', 'recipe', 5);
    const b = await snapshotQuota(kv, 'user_a', 'recipe', 5);
    expect(a.count).toBe(2);
    expect(b.count).toBe(2); // unchanged
    expect(a.remaining).toBe(3);
  });

  it('UNLIMITED returns Infinity remaining', async () => {
    const out = await snapshotQuota(kv, 'user_a', 'llm', UNLIMITED);
    expect(out.remaining).toBe(Infinity);
  });
});

describe('isQuotaKind', () => {
  it('accepts the three valid kinds', () => {
    expect(isQuotaKind('recipe')).toBe(true);
    expect(isQuotaKind('event')).toBe(true);
    expect(isQuotaKind('llm')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isQuotaKind('seats')).toBe(false);
    expect(isQuotaKind('')).toBe(false);
    expect(isQuotaKind(null)).toBe(false);
    expect(isQuotaKind(undefined)).toBe(false);
    expect(isQuotaKind(42)).toBe(false);
  });
});
