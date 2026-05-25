import { describe, it, expect, vi } from 'vitest';
import { cancelOwnSubscription, createCheckoutSession, createPortalSession, type StripeLike } from './billing';
import type { FetchLike } from './tier';

function makeStripeMock(overrides: Partial<StripeLike> = {}): StripeLike {
  return {
    checkout: {
      sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/abc' })) },
    },
    billingPortal: {
      sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.com/p/xyz' })) },
    },
    customers: {
      search: vi.fn(async () => ({ data: [], has_more: false })),
      create: vi.fn(async () => ({ id: 'cus_new' })),
      retrieve: vi.fn(),
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: [], has_more: false })),
      update: vi.fn(),
    },
    webhooks: {
      constructEventAsync: vi.fn(),
      constructEvent: vi.fn(),
    },
    ...overrides,
  } as unknown as StripeLike;
}

describe('createCheckoutSession', () => {
  it('creates a new Stripe customer when none exists, then a Checkout Session', async () => {
    const create = vi.fn(async () => ({ id: 'cus_new' }));
    const sessionCreate = vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/new' }));
    const stripe = makeStripeMock({
      customers: { search: vi.fn(async () => ({ data: [], has_more: false })), create, retrieve: vi.fn() } as unknown as StripeLike['customers'],
      checkout: { sessions: { create: sessionCreate } } as unknown as StripeLike['checkout'],
    });
    const { url } = await createCheckoutSession(
      stripe, 'user_abc', 'chef@example.com', 'month',
      'https://app/success', 'https://app/cancel', 'price_m', 'price_y',
    );
    expect(create).toHaveBeenCalledWith({
      email: 'chef@example.com',
      metadata: { clerk_user_id: 'user_abc' },
    });
    expect(sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_new',
      client_reference_id: 'user_abc',
      line_items: [{ price: 'price_m', quantity: 1 }],
      success_url: 'https://app/success',
      cancel_url: 'https://app/cancel',
    }));
    expect(url).toBe('https://checkout.stripe.com/c/new');
  });

  it('reuses an existing customer found via metadata search', async () => {
    const create = vi.fn();
    const stripe = makeStripeMock({
      customers: {
        search: vi.fn(async () => ({ data: [{ id: 'cus_existing' }], has_more: false })),
        create, retrieve: vi.fn(),
      } as unknown as StripeLike['customers'],
    });
    await createCheckoutSession(
      stripe, 'user_abc', null, 'month',
      'https://app/success', 'https://app/cancel', 'price_m', 'price_y',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('switches to the annual price id when interval=year', async () => {
    const sessionCreate = vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/y' }));
    const stripe = makeStripeMock({
      checkout: { sessions: { create: sessionCreate } } as unknown as StripeLike['checkout'],
    });
    await createCheckoutSession(
      stripe, 'user_abc', null, 'year',
      'https://app/success', 'https://app/cancel', 'price_m', 'price_y',
    );
    expect(sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_y', quantity: 1 }],
    }));
  });

  it('throws when Stripe returns a session without a url', async () => {
    const stripe = makeStripeMock({
      checkout: { sessions: { create: vi.fn(async () => ({ url: null })) } } as unknown as StripeLike['checkout'],
    });
    await expect(
      createCheckoutSession(stripe, 'u', null, 'month', 's', 'c', 'pm', 'py'),
    ).rejects.toThrow(/missing url/);
  });
});

describe('createPortalSession', () => {
  it('reads stripeCustomerId from Clerk and mints a portal session', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_known' } }), { status: 200 }),
    );
    const portalCreate = vi.fn(async () => ({ url: 'https://billing.stripe.com/p/abc' }));
    const stripe = makeStripeMock({
      billingPortal: { sessions: { create: portalCreate } } as unknown as StripeLike['billingPortal'],
    });
    const { url } = await createPortalSession(stripe, 'sk_clerk', 'user_abc', 'https://app/settings', fetchImpl);
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_known',
      return_url: 'https://app/settings',
    });
    expect(url).toBe('https://billing.stripe.com/p/abc');
  });

  it('throws when the user has no stripeCustomerId on file', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: {} }), { status: 200 }),
    );
    const stripe = makeStripeMock();
    await expect(
      createPortalSession(stripe, 'sk_clerk', 'user_abc', 'https://app/settings', fetchImpl),
    ).rejects.toThrow(/No Stripe customer/);
  });

  it('throws when Clerk lookup fails', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('err', { status: 500 }));
    const stripe = makeStripeMock();
    await expect(
      createPortalSession(stripe, 'sk_clerk', 'user_abc', 'https://app/settings', fetchImpl),
    ).rejects.toThrow(/No Stripe customer/);
  });

  it("flow='cancel' deep-links the portal to the cancel page for the active subscription", async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const portalCreate = vi.fn(async () => ({ url: 'https://billing.stripe.com/p/cancel' }));
    const subList = vi.fn(async () => ({ data: [{ id: 'sub_1' }], has_more: false }));
    const stripe = makeStripeMock({
      billingPortal: { sessions: { create: portalCreate } } as unknown as StripeLike['billingPortal'],
      subscriptions: { list: subList } as unknown as StripeLike['subscriptions'],
    });

    const { url } = await createPortalSession(
      stripe, 'sk_clerk', 'user_a', 'https://app/settings', fetchImpl, 'cancel',
    );

    expect(subList).toHaveBeenCalledWith({ customer: 'cus_x', status: 'active', limit: 1 });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_x',
      return_url: 'https://app/settings',
      flow_data: { type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_1' } },
    });
    expect(url).toBe('https://billing.stripe.com/p/cancel');
  });

  it("flow='cancel' throws when the user has no active subscription", async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const stripe = makeStripeMock({
      subscriptions: { list: vi.fn(async () => ({ data: [], has_more: false })), update: vi.fn() } as unknown as StripeLike['subscriptions'],
    });
    await expect(
      createPortalSession(stripe, 'sk_clerk', 'user_a', 'https://app/settings', fetchImpl, 'cancel'),
    ).rejects.toThrow(/No active subscription/);
  });
});

describe('cancelOwnSubscription', () => {
  it('marks the active subscription cancel_at_period_end=true and returns period-end timestamp', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const list = vi.fn(async () => ({
      data: [{ id: 'sub_1', status: 'active' }],
      has_more: false,
    }));
    const update = vi.fn(async () => ({
      id: 'sub_1',
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1735689600 }] },
    }));
    const stripe = makeStripeMock({
      subscriptions: { list, update } as unknown as StripeLike['subscriptions'],
    });

    const out = await cancelOwnSubscription(stripe, 'sk_clerk', 'user_a', fetchImpl);

    expect(list).toHaveBeenCalledWith({ customer: 'cus_x', status: 'active', limit: 1 });
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(out).toEqual({
      subscriptionId: 'sub_1',
      periodEndUnix: 1735689600,
      cancelAtPeriodEnd: true,
    });
  });

  it('throws when the user has no Stripe customer on file', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: {} }), { status: 200 }),
    );
    const stripe = makeStripeMock();
    await expect(
      cancelOwnSubscription(stripe, 'sk_clerk', 'user_a', fetchImpl),
    ).rejects.toThrow(/No Stripe customer/);
  });

  it('throws when the user has no active subscription', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      new Response(JSON.stringify({ public_metadata: { stripeCustomerId: 'cus_x' } }), { status: 200 }),
    );
    const stripe = makeStripeMock({
      subscriptions: { list: vi.fn(async () => ({ data: [], has_more: false })), update: vi.fn() } as unknown as StripeLike['subscriptions'],
    });
    await expect(
      cancelOwnSubscription(stripe, 'sk_clerk', 'user_a', fetchImpl),
    ).rejects.toThrow(/No active subscription/);
  });
});
