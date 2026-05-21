import type Stripe from 'stripe';
import { makeStripe, type StripeLike } from './billing';
import { invalidateTierCache } from './tier';
import type { FetchLike } from './tier';

export interface WebhookEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CLERK_SECRET_KEY: string;
  RATE_LIMIT: KVNamespace;
}

/**
 * Handle a Stripe webhook POST. Verifies the signature with the SDK's
 * `webhooks.constructEvent`, dispatches the few subscription lifecycle
 * events we care about, and writes the resulting tier to Clerk
 * publicMetadata. Returns a 200 even for events we ignore — Stripe retries
 * non-2xx, and we don't want to retry-loop on unhandled types.
 */
export async function handleStripeWebhook(
  req: Request,
  env: WebhookEnv,
  fetchImpl: FetchLike = fetch,
  stripeImpl?: StripeLike,
): Promise<Response> {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'Missing Stripe-Signature' }, 400);
  const body = await req.text();
  const stripe = stripeImpl ?? makeStripe(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    return json({ error: `Webhook signature verification failed: ${msg}` }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, env, fetchImpl);
        break;
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object as Stripe.Subscription, env, stripe, fetchImpl);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object as Stripe.Subscription, env, stripe, fetchImpl);
        break;
      // Ignore the rest — 200 prevents Stripe retry loops.
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }

  return json({ received: true }, 200);
}

async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
  env: WebhookEnv,
  fetchImpl: FetchLike,
): Promise<void> {
  const userId = session.client_reference_id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!userId || !customerId) return;
  await writeClerkMetadata(userId, env.CLERK_SECRET_KEY, fetchImpl, {
    tier: 'pro',
    stripeCustomerId: customerId,
  });
  await invalidateTierCache(userId, env.RATE_LIMIT);
}

async function onSubscriptionUpdated(
  sub: Stripe.Subscription,
  env: WebhookEnv,
  stripe: StripeLike,
  fetchImpl: FetchLike,
): Promise<void> {
  const userId = await resolveClerkUserId(sub.customer, stripe);
  if (!userId) return;
  // `active` and `trialing` keep tier=pro; anything else (past_due, unpaid,
  // canceled, paused, incomplete*) drops them back to free.
  const tier = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free';
  await writeClerkMetadata(userId, env.CLERK_SECRET_KEY, fetchImpl, { tier });
  await invalidateTierCache(userId, env.RATE_LIMIT);
}

async function onSubscriptionDeleted(
  sub: Stripe.Subscription,
  env: WebhookEnv,
  stripe: StripeLike,
  fetchImpl: FetchLike,
): Promise<void> {
  const userId = await resolveClerkUserId(sub.customer, stripe);
  if (!userId) return;
  await writeClerkMetadata(userId, env.CLERK_SECRET_KEY, fetchImpl, { tier: 'free' });
  await invalidateTierCache(userId, env.RATE_LIMIT);
}

async function resolveClerkUserId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
  stripe: StripeLike,
): Promise<string | null> {
  const customerId = typeof customer === 'string' ? customer : customer.id;
  const full = await stripe.customers.retrieve(customerId);
  if (full.deleted) return null;
  const userId = full.metadata?.clerk_user_id;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

/**
 * PATCH publicMetadata on a Clerk user. Naturally idempotent (Stripe
 * retries don't cause issues). Merges with whatever existing metadata is
 * there because Clerk's API replaces public_metadata wholesale — we'd
 * need a GET-then-PATCH dance, but for the two fields we touch (tier,
 * stripeCustomerId) the merge is straightforward.
 */
async function writeClerkMetadata(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike,
  patch: { tier: 'pro' | 'free'; stripeCustomerId?: string },
): Promise<void> {
  // Read current metadata first so we don't blow away unrelated fields.
  const current = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  let existing: Record<string, unknown> = {};
  if (current.ok) {
    const data = (await current.json()) as { public_metadata?: Record<string, unknown> };
    existing = data.public_metadata ?? {};
  }
  const merged = { ...existing, ...patch };
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${clerkSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_metadata: merged }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Clerk metadata PATCH failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
