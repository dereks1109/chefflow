import Stripe from 'stripe';
import type { FetchLike } from './tier';

// Stripe SDK in Cloudflare Workers needs the fetch HTTP client. Two
// helpers below construct the SDK; tests inject a mock via `makeStripe`.

export interface BillingEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID_PRO_MONTHLY: string;
  STRIPE_PRICE_ID_PRO_ANNUAL: string;
  // Enterprise prices are optional — when missing, the worker returns a
  // clean 500 with "Enterprise checkout not configured" instead of failing
  // at runtime. Set via `wrangler secret put` in the deploy environment.
  STRIPE_PRICE_ID_ENTERPRISE_MONTHLY?: string;
  STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?: string;
  CLERK_SECRET_KEY: string;
  RATE_LIMIT: KVNamespace;
}

export type Interval = 'month' | 'year';

export type StripeLike = Pick<Stripe, 'checkout' | 'billingPortal' | 'customers' | 'webhooks' | 'subscriptions'>;

export type PortalFlow = 'cancel';

export function makeStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: '2026-04-22.dahlia',
  });
}

/**
 * Mint a Stripe Checkout Session URL for the upgrade flow. Creates (or
 * reuses) a Stripe Customer keyed by clerk userId in `customer.metadata`
 * so webhooks can map back to the Clerk user without an external index.
 */
export async function createCheckoutSession(
  stripe: StripeLike,
  userId: string,
  userEmail: string | null,
  interval: Interval,
  successUrl: string,
  cancelUrl: string,
  priceMonthly: string,
  priceAnnual: string,
): Promise<{ url: string }> {
  const customer = await getOrCreateCustomer(stripe, userId, userEmail);
  const price = interval === 'year' ? priceAnnual : priceMonthly;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    client_reference_id: userId,
    line_items: [{ price, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Idempotent in the URL: if Stripe re-runs the same upgrade flow we
    // do not double-create customers because we look them up by metadata.
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error('Stripe Checkout session missing url');
  return { url: session.url };
}

/**
 * Mint a Stripe Customer Portal session for an existing customer. Reads
 * the Stripe customer id from Clerk publicMetadata.stripeCustomerId
 * (written by the webhook on first checkout.session.completed).
 *
 * When `flow === 'cancel'`, deep-links the portal straight to the
 * subscription-cancel page for the customer's active subscription.
 * Stripe handles the "are you sure" UX, retention offers, and the actual
 * cancellation; our `customer.subscription.updated/deleted` webhook then
 * flips Clerk tier back to 'free'.
 */
export async function createPortalSession(
  stripe: StripeLike,
  clerkSecret: string,
  userId: string,
  returnUrl: string,
  fetchImpl: FetchLike = fetch,
  flow?: PortalFlow,
): Promise<{ url: string }> {
  const customerId = await readClerkStripeCustomerId(userId, clerkSecret, fetchImpl);
  if (!customerId) throw new Error('No Stripe customer on file for this user');

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: customerId,
    return_url: returnUrl,
  };

  if (flow === 'cancel') {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
    const sub = subs.data[0];
    if (!sub) throw new Error('No active subscription to cancel');
    params.flow_data = {
      type: 'subscription_cancel',
      subscription_cancel: { subscription: sub.id },
    };
  }

  const session = await stripe.billingPortal.sessions.create(params);
  return { url: session.url };
}

/**
 * Mark the caller's active Stripe subscription to cancel at the end of the
 * current billing period. The user keeps Pro until the period ends; Stripe
 * fires `customer.subscription.updated` (and eventually `.deleted`) which
 * our webhook flips into Clerk tier=free. Returns the period-end timestamp
 * so the SPA can show "You'll keep Pro until <date>".
 */
export async function cancelOwnSubscription(
  stripe: StripeLike,
  clerkSecret: string,
  userId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ subscriptionId: string; periodEndUnix: number; cancelAtPeriodEnd: boolean }> {
  const customerId = await readClerkStripeCustomerId(userId, clerkSecret, fetchImpl);
  if (!customerId) throw new Error('No Stripe customer on file for this user');
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
  const sub = subs.data[0];
  if (!sub) throw new Error('No active subscription to cancel');
  const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  // Stripe API 2026-04-22.dahlia moved current_period_end off the top-level
  // Subscription and onto each SubscriptionItem. We read the first item; for
  // a single-price subscription that's the whole truth.
  const periodEndUnix = updated.items?.data?.[0]?.current_period_end ?? 0;
  return {
    subscriptionId: updated.id,
    periodEndUnix,
    cancelAtPeriodEnd: updated.cancel_at_period_end,
  };
}

async function getOrCreateCustomer(
  stripe: StripeLike,
  userId: string,
  email: string | null,
): Promise<Stripe.Customer> {
  // Search by metadata. Stripe's `customers.search` is a stable API.
  const search = await stripe.customers.search({
    query: `metadata['clerk_user_id']:'${userId}'`,
    limit: 1,
  });
  if (search.data[0]) return search.data[0];
  return stripe.customers.create({
    email: email ?? undefined,
    metadata: { clerk_user_id: userId },
  });
}

async function readClerkStripeCustomerId(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { public_metadata?: { stripeCustomerId?: unknown } };
  const id = user.public_metadata?.stripeCustomerId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
