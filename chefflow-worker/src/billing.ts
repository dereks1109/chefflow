import Stripe from 'stripe';
import type { FetchLike } from './tier';

// Stripe SDK in Cloudflare Workers needs the fetch HTTP client. Two
// helpers below construct the SDK; tests inject a mock via `makeStripe`.

export interface BillingEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_PRICE_ID_PRO_MONTHLY: string;
  STRIPE_PRICE_ID_PRO_ANNUAL: string;
  CLERK_SECRET_KEY: string;
  RATE_LIMIT: KVNamespace;
}

export type Interval = 'month' | 'year';

export type StripeLike = Pick<Stripe, 'checkout' | 'billingPortal' | 'customers' | 'webhooks'>;

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
 */
export async function createPortalSession(
  stripe: StripeLike,
  clerkSecret: string,
  userId: string,
  returnUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ url: string }> {
  const customerId = await readClerkStripeCustomerId(userId, clerkSecret, fetchImpl);
  if (!customerId) throw new Error('No Stripe customer on file for this user');
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
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
