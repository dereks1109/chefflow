import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  consumeDailyQuota,
  getQuotaSnapshot,
  QuotaExceededError,
  QuotaClientError,
} from './quotaClient';

function stubClerk(token: string | null) {
  (window as unknown as { Clerk?: unknown }).Clerk = token
    ? { session: { getToken: vi.fn(async () => token) } }
    : { session: null };
}

beforeEach(() => {
  stubClerk('fake.jwt.token');
});

describe('consumeDailyQuota', () => {
  it('POSTs to /quota/consume with Bearer JWT + {kind} body', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = vi.fn(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ allowed: true, count: 1, remaining: 4 }), { status: 200 });
    });

    const out = await consumeDailyQuota({ kind: 'recipe', fetchImpl });
    expect(capturedUrl).toBe('/quota/consume');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer fake.jwt.token');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({ kind: 'recipe' });
    expect(out.count).toBe(1);
    expect(out.remaining).toBe(4);
  });

  it('throws QuotaExceededError on 429 with kind + retryAfterSeconds', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ kind: 'recipe' }), {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }),
    );
    try {
      await consumeDailyQuota({ kind: 'recipe', fetchImpl });
      expect.fail('expected QuotaExceededError');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect((err as QuotaExceededError).kind).toBe('recipe');
      expect((err as QuotaExceededError).retryAfterSeconds).toBe(3600);
    }
  });

  it('throws QuotaClientError on other non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(consumeDailyQuota({ kind: 'recipe', fetchImpl })).rejects.toBeInstanceOf(QuotaClientError);
  });

  it('throws QuotaClientError(401) when not signed in', async () => {
    stubClerk(null);
    const fetchImpl = vi.fn();
    try {
      await consumeDailyQuota({ kind: 'recipe', fetchImpl });
      expect.fail('expected QuotaClientError');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaClientError);
      expect((err as QuotaClientError).status).toBe(401);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours origin override (cross-host dev)', async () => {
    let capturedUrl = '';
    const fetchImpl: typeof fetch = vi.fn(async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ allowed: true, count: 1, remaining: 4 }), { status: 200 });
    });
    await consumeDailyQuota({ kind: 'recipe', origin: 'https://worker.test/', fetchImpl });
    expect(capturedUrl).toBe('https://worker.test/quota/consume');
  });
});

describe('getQuotaSnapshot', () => {
  it('GETs /quota/snapshot and returns the parsed body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tier: 'free',
          quotas: {
            recipe: { count: 2, remaining: 3, limit: 5 },
            event: { count: 0, remaining: 1, limit: 1 },
            llm: { count: 1, remaining: 9, limit: 10 },
          },
        }),
        { status: 200 },
      ),
    );
    const out = await getQuotaSnapshot({ fetchImpl });
    expect(out.tier).toBe('free');
    expect(out.quotas.recipe.count).toBe(2);
    expect(out.quotas.llm.remaining).toBe(9);
  });
});
