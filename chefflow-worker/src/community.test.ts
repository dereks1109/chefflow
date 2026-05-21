import { describe, it, expect, beforeEach } from 'vitest';
import {
  publish,
  unpublish,
  listRecent,
  get,
  toggleLike,
  recordCopy,
  hasLiked,
  CommunityForbidden,
  CommunityNotFound,
  type SourceRecipe,
} from './community';

// Same in-memory KV stub used in quota.test.ts, extended with prefix-aware
// list() so unpublish's like-cleanup loop works.
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async list(opts?: { prefix?: string; cursor?: string }) {
      const prefix = opts?.prefix ?? '';
      const names = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
      return {
        keys: names.map((name) => ({ name })),
        list_complete: true,
        cacheStatus: null,
      };
    },
  } as unknown as KVNamespace;
}

let kv: KVNamespace;

function sampleRecipe(overrides: Partial<SourceRecipe> = {}): SourceRecipe {
  return {
    id: 'r_local_abc',
    title: 'Boeuf Bourguignon',
    originalYield: 4,
    ingredients: [{ name: 'beef', amount: 800, unit: 'g' }],
    steps: [{ text: 'Sear the beef' }],
    coverPhoto: 'data:image/jpeg;base64,xxx',
    analysis: { caloriesPerPortion: 650 },
    ...overrides,
  };
}

beforeEach(() => {
  kv = makeKv();
});

describe('publish', () => {
  it('writes a record with cr_ id and zero counters, returns id', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe(), 1700000000000);
    expect(id.startsWith('cr_')).toBe(true);
    const record = await get(kv, id);
    expect(record).not.toBeNull();
    expect(record!.title).toBe('Boeuf Bourguignon');
    expect(record!.authorClerkId).toBe('user_a');
    expect(record!.authorDisplayName).toBe('Alice');
    expect(record!.likes).toBe(0);
    expect(record!.copies).toBe(0);
    expect(record!.publishedAt).toBe(1700000000000);
  });

  it('falls back to "Anonymous chef" when displayName is empty/whitespace', async () => {
    const { id } = await publish(kv, 'user_a', '   ', sampleRecipe());
    const record = await get(kv, id);
    expect(record!.authorDisplayName).toBe('Anonymous chef');
  });

  it('appends to the byPublishedDesc index newest-first', async () => {
    await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: 'r1', title: 'First' }), 1000);
    await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: 'r2', title: 'Second' }), 2000);
    const list = await listRecent(kv);
    expect(list.map((s) => s.title)).toEqual(['Second', 'First']);
  });

  it('republishing same author+sourceLocalId updates in place and preserves counters', async () => {
    const { id: first } = await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: 'rX', title: 'V1' }), 1000);
    await toggleLike(kv, 'user_b', first);
    await recordCopy(kv, first);

    const { id: second } = await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: 'rX', title: 'V2' }), 2000);
    expect(second).toBe(first);
    const record = await get(kv, first);
    expect(record!.title).toBe('V2');
    expect(record!.likes).toBe(1);
    expect(record!.copies).toBe(1);

    // Index should not have grown.
    const list = await listRecent(kv);
    expect(list).toHaveLength(1);
  });

  it('different authors publishing the same sourceLocalId get distinct records', async () => {
    const { id: a } = await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: 'shared' }), 1000);
    const { id: b } = await publish(kv, 'user_b', 'Bob', sampleRecipe({ id: 'shared' }), 2000);
    expect(a).not.toBe(b);
  });
});

describe('listRecent', () => {
  it('returns slim summaries without ingredients/steps', async () => {
    await publish(kv, 'user_a', 'Alice', sampleRecipe(), 1000);
    const list = await listRecent(kv);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      title: 'Boeuf Bourguignon',
      authorDisplayName: 'Alice',
      likes: 0,
      copies: 0,
    });
    expect((list[0] as unknown as Record<string, unknown>).ingredients).toBeUndefined();
    expect((list[0] as unknown as Record<string, unknown>).steps).toBeUndefined();
  });

  it('honours the limit argument', async () => {
    for (let i = 0; i < 5; i++) {
      await publish(kv, 'user_a', 'Alice', sampleRecipe({ id: `r${i}`, title: `R${i}` }), 1000 + i);
    }
    const list = await listRecent(kv, 3);
    expect(list).toHaveLength(3);
  });

  it('skips entries whose record was deleted out-of-band', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe(), 1000);
    await kv.delete(`c:r:${id}`);
    const list = await listRecent(kv);
    expect(list).toHaveLength(0);
  });
});

describe('get', () => {
  it('returns null for unknown ids', async () => {
    expect(await get(kv, 'cr_nope')).toBeNull();
  });
});

describe('toggleLike', () => {
  it('first call likes and increments to 1', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    const out = await toggleLike(kv, 'user_b', id);
    expect(out).toEqual({ liked: true, likes: 1 });
    expect(await hasLiked(kv, 'user_b', id)).toBe(true);
  });

  it('second call by same user unlikes and decrements', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    await toggleLike(kv, 'user_b', id);
    const out = await toggleLike(kv, 'user_b', id);
    expect(out).toEqual({ liked: false, likes: 0 });
    expect(await hasLiked(kv, 'user_b', id)).toBe(false);
  });

  it('two distinct users each contribute one like', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    await toggleLike(kv, 'user_b', id);
    const out = await toggleLike(kv, 'user_c', id);
    expect(out.likes).toBe(2);
  });

  it('throws CommunityNotFound on unknown id', async () => {
    await expect(toggleLike(kv, 'user_b', 'cr_nope')).rejects.toBeInstanceOf(CommunityNotFound);
  });
});

describe('recordCopy', () => {
  it('increments the copies counter', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    const a = await recordCopy(kv, id);
    expect(a.copies).toBe(1);
    const b = await recordCopy(kv, id);
    expect(b.copies).toBe(2);
  });

  it('throws CommunityNotFound on unknown id', async () => {
    await expect(recordCopy(kv, 'cr_nope')).rejects.toBeInstanceOf(CommunityNotFound);
  });
});

describe('unpublish', () => {
  it('removes the record, the index entry, and all like markers', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    await toggleLike(kv, 'user_b', id);
    await toggleLike(kv, 'user_c', id);

    await unpublish(kv, 'user_a', id);

    expect(await get(kv, id)).toBeNull();
    const list = await listRecent(kv);
    expect(list).toHaveLength(0);
    expect(await hasLiked(kv, 'user_b', id)).toBe(false);
    expect(await hasLiked(kv, 'user_c', id)).toBe(false);
  });

  it('refuses unpublish from a different user', async () => {
    const { id } = await publish(kv, 'user_a', 'Alice', sampleRecipe());
    await expect(unpublish(kv, 'user_other', id)).rejects.toBeInstanceOf(CommunityForbidden);
    expect(await get(kv, id)).not.toBeNull();
  });

  it('throws CommunityNotFound on unknown id', async () => {
    await expect(unpublish(kv, 'user_a', 'cr_nope')).rejects.toBeInstanceOf(CommunityNotFound);
  });
});
