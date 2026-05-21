import { describe, it, expect, vi } from 'vitest';
import { handleStripeWebhook, type WebhookEnv } from './stripeWebhook';
import type { StripeLike } from './billing';
import type { FetchLike } from './tier';

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: Array.from(store.keys()).map((name) => ({ name })), list_complete: true, cacheStatus: null }; },
  } as unknown as KVNamespace;
}

function makeEnv(): WebhookEnv {
  return {
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    CLERK_SECRET_KEY: 'sk_clerk',
    RATE_LIMIT: makeKv(),
  };
}

function makeReq(body: string, sig: string | null = 'mock-sig'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sig) headers['Stripe-Signature'] = sig;
  return new Request('https://api.test/webhook/stripe', { method: 'POST', body, headers });
}

function stubStripe(event: unknown, customerLookup?: Record<string, { metadata?: { clerk_user_id?: string }; deleted?: true }>): StripeLike {
  return {
    webhooks: {
      constructEventAsync: vi.fn(async () => event),
      constructEvent: vi.fn(),
    },
    customers: {
      retrieve: vi.fn(async (id: string) => customerLookup?.[id] ?? { id, deleted: true }),
      search: vi.fn(),
      create: vi.fn(),
    },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  } as unknown as StripeLike;
}

// Fetch stub: GET returns the supplied metadata; PATCH always 200s and
// records the body for assertions.
function makeFetch(getMetadata: Record<string, unknown> = {}): { fetch: FetchLike; patches: Array<{ url: string; body: unknown }> } {
  const patches: Array<{ url: string; body: unknown }> = [];
  const fetchImpl: FetchLike = vi.fn(async (url, init) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      patches.push({ url: u, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ public_metadata: getMetadata }), { status: 200 });
  });
  return { fetch: fetchImpl, patches };
}

describe('handleStripeWebhook', () => {
  it('400 when Stripe-Signature header is missing', async () => {
    const res = await handleStripeWebhook(makeReq('{}', null), makeEnv(), vi.fn(), stubStripe({}));
    expect(res.status).toBe(400);
  });

  it('400 when signature verification fails', async () => {
    const stripe = {
      webhooks: { constructEventAsync: vi.fn(async () => { throw new Error('bad sig'); }), constructEvent: vi.fn() },
      customers: { retrieve: vi.fn(), search: vi.fn(), create: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
    } as unknown as StripeLike;
    const res = await handleStripeWebhook(makeReq('{}'), makeEnv(), vi.fn(), stripe);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/signature verification failed/);
  });

  it('checkout.session.completed → writes tier=pro + stripeCustomerId to Clerk', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user_abc', customer: 'cus_xyz' } },
    };
    const stripe = stubStripe(event);
    const { fetch, patches } = makeFetch();
    const res = await handleStripeWebhook(makeReq(JSON.stringify(event)), makeEnv(), fetch, stripe);
    expect(res.status).toBe(200);
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe('https://api.clerk.com/v1/users/user_abc/metadata');
    expect((patches[0].body as { public_metadata: { tier: string; stripeCustomerId: string } }).public_metadata).toEqual({
      tier: 'pro', stripeCustomerId: 'cus_xyz',
    });
  });

  it('customer.subscription.deleted → resolves clerk user via Stripe metadata, sets tier=free', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_xyz' } },
    };
    const stripe = stubStripe(event, { cus_xyz: { metadata: { clerk_user_id: 'user_abc' } } });
    const { fetch, patches } = makeFetch({ stripeCustomerId: 'cus_xyz' });
    await handleStripeWebhook(makeReq(JSON.stringify(event)), makeEnv(), fetch, stripe);
    expect(patches[0].body).toEqual({
      public_metadata: { stripeCustomerId: 'cus_xyz', tier: 'free' },
    });
  });

  it('customer.subscription.updated active → tier=pro; past_due → tier=free', async () => {
    for (const [status, expectedTier] of [['active', 'pro'], ['past_due', 'free'], ['trialing', 'pro']] as const) {
      const event = {
        type: 'customer.subscription.updated',
        data: { object: { customer: 'cus_xyz', status } },
      };
      const stripe = stubStripe(event, { cus_xyz: { metadata: { clerk_user_id: 'user_abc' } } });
      const { fetch, patches } = makeFetch();
      await handleStripeWebhook(makeReq(JSON.stringify(event)), makeEnv(), fetch, stripe);
      expect((patches[0].body as { public_metadata: { tier: string } }).public_metadata.tier).toBe(expectedTier);
    }
  });

  it('unhandled event types return 200 (no Stripe retry loop)', async () => {
    const event = { type: 'payment_intent.created', data: { object: {} } };
    const stripe = stubStripe(event);
    const res = await handleStripeWebhook(makeReq(JSON.stringify(event)), makeEnv(), vi.fn(), stripe);
    expect(res.status).toBe(200);
  });

  it('customer.subscription.* with no clerk_user_id in metadata is a no-op (200)', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_unknown' } },
    };
    const stripe = stubStripe(event, { cus_unknown: { metadata: {} } });
    const { fetch, patches } = makeFetch();
    const res = await handleStripeWebhook(makeReq(JSON.stringify(event)), makeEnv(), fetch, stripe);
    expect(res.status).toBe(200);
    expect(patches).toHaveLength(0);
  });
});
