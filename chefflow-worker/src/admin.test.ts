import { describe, it, expect, vi } from 'vitest';
import {
  requireAdmin,
  listMembers,
  getMetrics,
  grantPro,
  grantTier,
  revokePro,
  cancelUserSubscription,
  refundLatestCharge,
  AdminForbiddenError,
  type AdminEnv,
  type StripeAdminLike,
} from './admin';
import { UnauthorizedError } from './auth';
import type { FetchLike } from './tier';

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

function makeEnv(): AdminEnv {
  return { CLERK_SECRET_KEY: 'sk_test_clerk', RATE_LIMIT: makeKv() };
}

function stubClerkUser(metadata: Record<string, unknown> = {}): FetchLike {
  return vi.fn(async () =>
    new Response(JSON.stringify({ public_metadata: metadata }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('requireAdmin', () => {
  it('passes for users with publicMetadata.role === "admin"', async () => {
    await expect(
      requireAdmin('user_a', 'sk_test', stubClerkUser({ role: 'admin' })),
    ).resolves.toBeUndefined();
  });

  it('throws AdminForbiddenError when role is missing', async () => {
    await expect(requireAdmin('user_a', 'sk_test', stubClerkUser({}))).rejects.toThrow(AdminForbiddenError);
  });

  it('throws AdminForbiddenError when role is some other string', async () => {
    await expect(
      requireAdmin('user_a', 'sk_test', stubClerkUser({ role: 'manager' })),
    ).rejects.toThrow(AdminForbiddenError);
  });

  it('throws UnauthorizedError when Clerk returns 404', async () => {
    const fetch404: FetchLike = vi.fn(async () => new Response('', { status: 404 }));
    await expect(requireAdmin('user_a', 'sk_test', fetch404)).rejects.toThrow(UnauthorizedError);
  });
});

function makeStripe(overrides: Partial<StripeAdminLike> = {}): StripeAdminLike {
  return {
    customers: { search: vi.fn(), create: vi.fn(), retrieve: vi.fn() },
    subscriptions: { list: vi.fn(async () => ({ data: [], has_more: false })), update: vi.fn(), cancel: vi.fn() },
    invoices: { list: vi.fn(async () => ({ data: [], has_more: false })) },
    refunds: { create: vi.fn() },
    events: { list: vi.fn(async () => ({ data: [], has_more: false })) },
    charges: { list: vi.fn(async () => ({ data: [], has_more: false })) },
    ...overrides,
  } as unknown as StripeAdminLike;
}

describe('listMembers', () => {
  it('returns users decorated with Stripe subscription state', async () => {
    const clerkUsers = [
      { id: 'user_a', created_at: 1700000000000, email_addresses: [{ email_address: 'a@example.com' }], public_metadata: { tier: 'pro', stripeCustomerId: 'cus_a' } },
      { id: 'user_b', created_at: 1700000100000, email_addresses: [{ email_address: 'b@example.com' }], public_metadata: { tier: 'free' } },
    ];
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify(clerkUsers), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const stripe = makeStripe({
      subscriptions: {
        list: vi.fn(async () => ({
          data: [{ id: 'sub_1', status: 'active', cancel_at_period_end: false }],
          has_more: false,
        })),
        update: vi.fn(),
        cancel: vi.fn(),
      } as unknown as StripeAdminLike['subscriptions'],
    });

    const out = await listMembers(makeEnv(), stripe, fetchImpl, 0, 50);

    expect(out.members).toHaveLength(2);
    expect(out.members[0]).toMatchObject({
      userId: 'user_a',
      email: 'a@example.com',
      tier: 'pro',
      stripeCustomerId: 'cus_a',
      subscriptionStatus: 'active',
      subscriptionId: 'sub_1',
    });
    expect(out.members[1]).toMatchObject({
      userId: 'user_b',
      tier: 'free',
      stripeCustomerId: null,
      subscriptionStatus: 'none',
    });
    // Only user_a had a Stripe customer; user_b skips the sub lookup.
    expect(stripe.subscriptions.list).toHaveBeenCalledTimes(1);
  });

  it('signals more pages when the returned page fills the limit', async () => {
    const users = Array.from({ length: 50 }, (_, i) => ({
      id: `u${i}`, created_at: i, email_addresses: [], public_metadata: {},
    }));
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify(users), { status: 200 }),
    );
    const out = await listMembers(makeEnv(), makeStripe(), fetchImpl, 0, 50);
    expect(out.nextOffset).toBe(50);
  });
});

describe('getMetrics', () => {
  it('counts members by tier and sums MRR from active subscriptions', async () => {
    const clerkUsers = [
      { id: 'u1', created_at: 1, email_addresses: [], public_metadata: { tier: 'pro' } },
      { id: 'u2', created_at: 2, email_addresses: [], public_metadata: { tier: 'free' } },
      { id: 'u3', created_at: 3, email_addresses: [], public_metadata: { tier: 'pro' } },
    ];
    let clerkCallCount = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      clerkCallCount++;
      // First call returns users, second returns empty (page boundary).
      const body = clerkCallCount === 1 ? clerkUsers : [];
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const stripe = makeStripe({
      subscriptions: {
        list: vi.fn(async () => ({
          data: [
            { id: 'sub_1', items: { data: [{ price: { unit_amount: 1200, recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] } },
            { id: 'sub_2', items: { data: [{ price: { unit_amount: 10800, recurring: { interval: 'year', interval_count: 1 } }, quantity: 1 }] } },
          ],
          has_more: false,
        })),
        update: vi.fn(),
        cancel: vi.fn(),
      } as unknown as StripeAdminLike['subscriptions'],
    });

    const out = await getMetrics(makeEnv(), stripe, fetchImpl);

    expect(out.totalMembers).toBe(3);
    expect(out.byTier).toEqual({ free: 1, pro: 2, business: 0, enterprise: 0 });
    // Active subs are returned twice (once per status iteration: active + trialing).
    // sub_1 = 1200 pence/month; sub_2 = 10800/12 = 900 pence/month → 2100 per pass × 2 = 4200.
    expect(out.mrrPence).toBe(4200);
    expect(out.payingSubscribers).toBe(4);
  });
});

describe('grantPro / revokePro', () => {
  it('grantPro PATCHes Clerk metadata with tier=pro and invalidates KV cache', async () => {
    const env = makeEnv();
    await env.RATE_LIMIT.put('tier:user_a', 'free');
    let patchedBody: unknown = null;
    const fetchImpl: FetchLike = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchedBody = init.body;
        return new Response('{}', { status: 200 });
      }
      // GET — return existing metadata
      return new Response(JSON.stringify({ public_metadata: { tier: 'free', stripeCustomerId: 'cus_x' } }), { status: 200 });
    });

    await grantPro('user_a', env, fetchImpl);

    expect(JSON.parse(patchedBody as string)).toEqual({
      public_metadata: { tier: 'pro', stripeCustomerId: 'cus_x' },
    });
    // KV cache for the user's tier should be cleared so the next /quota call re-reads.
    expect(await env.RATE_LIMIT.get('tier:user_a')).toBeNull();
  });

  it('grantTier("enterprise") PATCHes Clerk metadata with tier=enterprise + invalidates KV cache', async () => {
    const env = makeEnv();
    await env.RATE_LIMIT.put('tier:user_a', 'pro');
    let patchedBody: unknown = null;
    const fetchImpl: FetchLike = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchedBody = init.body;
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ public_metadata: { tier: 'pro', stripeCustomerId: 'cus_x' } }), { status: 200 });
    });

    await grantTier('user_a', 'enterprise', env, fetchImpl);

    // Preserves other metadata; only the tier flips.
    expect(JSON.parse(patchedBody as string)).toEqual({
      public_metadata: { tier: 'enterprise', stripeCustomerId: 'cus_x' },
    });
    expect(await env.RATE_LIMIT.get('tier:user_a')).toBeNull();
  });

  it('revokePro flips tier=free', async () => {
    const fetchImpl: FetchLike = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ public_metadata: { tier: 'pro' } }), { status: 200 });
    });
    await expect(revokePro('user_a', makeEnv(), fetchImpl)).resolves.toBeUndefined();
  });
});

describe('cancelUserSubscription', () => {
  it('sets cancel_at_period_end=true when atPeriodEnd is true', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const update = vi.fn(async () => ({ id: 'sub_1', status: 'active', cancel_at_period_end: true }));
    const stripe = makeStripe({
      subscriptions: {
        list: vi.fn(async () => ({
          data: [{ id: 'sub_1', status: 'active', cancel_at_period_end: false }],
          has_more: false,
        })),
        update,
        cancel: vi.fn(),
      } as unknown as StripeAdminLike['subscriptions'],
    });

    const out = await cancelUserSubscription('user_a', makeEnv(), stripe, fetchImpl, true);

    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(out).toEqual({ subscriptionId: 'sub_1', status: 'active', cancelAtPeriodEnd: true });
  });

  it('cancels immediately when atPeriodEnd is false', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const cancel = vi.fn(async () => ({ id: 'sub_1', status: 'canceled', cancel_at_period_end: false }));
    const stripe = makeStripe({
      subscriptions: {
        list: vi.fn(async () => ({
          data: [{ id: 'sub_1', status: 'active', cancel_at_period_end: false }],
          has_more: false,
        })),
        update: vi.fn(),
        cancel,
      } as unknown as StripeAdminLike['subscriptions'],
    });

    const out = await cancelUserSubscription('user_a', makeEnv(), stripe, fetchImpl, false);

    expect(cancel).toHaveBeenCalledWith('sub_1');
    expect(out.status).toBe('canceled');
  });

  it('throws when the user has no Stripe customer', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: {} }), { status: 200 }),
    );
    await expect(
      cancelUserSubscription('user_a', makeEnv(), makeStripe(), fetchImpl, false),
    ).rejects.toThrow('No Stripe customer');
  });
});

describe('refundLatestCharge', () => {
  it('refunds the latest succeeded charge for the customer', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const create = vi.fn(async () => ({ id: 're_1', amount: 1200, currency: 'gbp' }));
    const stripe = makeStripe({
      charges: {
        list: vi.fn(async () => ({
          data: [{ id: 'ch_1', status: 'succeeded', refunded: false }],
          has_more: false,
        })),
      } as unknown as StripeAdminLike['charges'],
      refunds: { create } as unknown as StripeAdminLike['refunds'],
    });

    const out = await refundLatestCharge('user_a', makeEnv(), stripe, fetchImpl);

    expect(create).toHaveBeenCalledWith({ charge: 'ch_1' });
    expect(out).toEqual({ refundId: 're_1', amount: 1200, currency: 'gbp' });
  });

  it('throws when no refundable charge exists', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const stripe = makeStripe({
      charges: {
        list: vi.fn(async () => ({ data: [{ id: 'ch_1', status: 'succeeded', refunded: true }], has_more: false })),
      } as unknown as StripeAdminLike['charges'],
    });
    await expect(
      refundLatestCharge('user_a', makeEnv(), stripe, fetchImpl),
    ).rejects.toThrow('No refundable charge');
  });
});
