import type Stripe from 'stripe';
import { UnauthorizedError } from './auth';
import { invalidateTierCache, type FetchLike } from './tier';
import { parseTier, type Tier } from '../../chefflow/src/core/tier/limits';

// ---------------------------------------------------------------------------
// Admin endpoints — backs the /admin dashboard. Gated by Clerk
// publicMetadata.role === 'admin'. Bootstrap the first admin in the Clerk
// Dashboard: Users → your user → Public metadata → add `{ "role": "admin" }`.
// ---------------------------------------------------------------------------

export interface AdminEnv {
  CLERK_SECRET_KEY: string;
  RATE_LIMIT: KVNamespace;
}

export class AdminForbiddenError extends Error {
  constructor(message = 'Admin role required') {
    super(message);
    this.name = 'AdminForbiddenError';
  }
}

/** Pulled in narrowly so tests can mock with a plain object. */
export type StripeAdminLike = Pick<
  Stripe,
  'customers' | 'subscriptions' | 'invoices' | 'refunds' | 'events' | 'charges'
>;

/**
 * Throw AdminForbiddenError unless the authenticated user has
 * publicMetadata.role === 'admin'. Throws UnauthorizedError on Clerk failure
 * to read the user.
 */
export async function requireAdmin(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  if (!res.ok) throw new UnauthorizedError(`Clerk user lookup failed (${res.status})`);
  const user = (await res.json()) as { public_metadata?: { role?: unknown } };
  const role = user.public_metadata?.role;
  if (role !== 'admin') throw new AdminForbiddenError();
}

export interface ClerkUserRaw {
  id: string;
  created_at: number;
  email_addresses?: { email_address: string }[];
  public_metadata?: { tier?: unknown; role?: unknown; stripeCustomerId?: unknown };
}

interface ClerkUserListItem extends ClerkUserRaw {}

/** Page over Clerk's user list. */
async function listClerkUsersPage(
  clerkSecret: string,
  fetchImpl: FetchLike,
  offset: number,
  limit: number,
): Promise<ClerkUserListItem[]> {
  const url = `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}&order_by=-created_at`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  if (!res.ok) throw new Error(`Clerk users list failed (${res.status})`);
  return (await res.json()) as ClerkUserListItem[];
}

export interface MemberRow {
  userId: string;
  email: string | null;
  tier: Tier;
  role: string | null;
  createdAt: number;
  stripeCustomerId: string | null;
  subscriptionStatus: Stripe.Subscription.Status | 'none';
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ListMembersResult {
  members: MemberRow[];
  nextOffset: number | null;
}

/**
 * Fetch one page of members and decorate each with their latest Stripe
 * subscription state. Concurrency capped at 8 to be polite to Stripe.
 */
export async function listMembers(
  env: AdminEnv,
  stripe: StripeAdminLike,
  fetchImpl: FetchLike,
  offset = 0,
  limit = 50,
): Promise<ListMembersResult> {
  const users = await listClerkUsersPage(env.CLERK_SECRET_KEY, fetchImpl, offset, limit);
  const decorated = await mapWithConcurrency(users, 8, (u) => decorateMember(u, stripe));
  // Clerk doesn't tell us if there are more pages — if we filled the page,
  // assume so. Caller stops paging when nextOffset stays null.
  const nextOffset = users.length === limit ? offset + limit : null;
  return { members: decorated, nextOffset };
}

async function decorateMember(u: ClerkUserListItem, stripe: StripeAdminLike): Promise<MemberRow> {
  const stripeCustomerId = typeof u.public_metadata?.stripeCustomerId === 'string'
    ? u.public_metadata.stripeCustomerId
    : null;
  let subscriptionStatus: MemberRow['subscriptionStatus'] = 'none';
  let subscriptionId: string | null = null;
  let cancelAtPeriodEnd = false;
  if (stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 1,
      });
      const sub = subs.data[0];
      if (sub) {
        subscriptionStatus = sub.status;
        subscriptionId = sub.id;
        cancelAtPeriodEnd = sub.cancel_at_period_end;
      }
    } catch {
      // Leave defaults — admin UI shows 'none' and the table still loads.
    }
  }
  return {
    userId: u.id,
    email: u.email_addresses?.[0]?.email_address ?? null,
    tier: parseTier(u.public_metadata?.tier),
    role: typeof u.public_metadata?.role === 'string' ? u.public_metadata.role : null,
    createdAt: u.created_at,
    stripeCustomerId,
    subscriptionStatus,
    subscriptionId,
    cancelAtPeriodEnd,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

export interface MetricsResult {
  totalMembers: number;
  byTier: Record<Tier, number>;
  /** Monthly recurring revenue in the price's smallest currency unit (GBP pence). */
  mrrPence: number;
  /** Subscriber count that contributes to MRR (status=active or trialing). */
  payingSubscribers: number;
  computedAt: number;
}

const METRICS_CACHE_KEY = 'admin:metrics:v1';
const METRICS_CACHE_TTL_SECONDS = 60;

/**
 * Aggregate global membership counts + MRR. Sums every Stripe subscription
 * with status `active` or `trialing` (`price.recurring.interval` normalised
 * to a monthly figure). Result cached in KV for 60s.
 */
export async function getMetrics(
  env: AdminEnv,
  stripe: StripeAdminLike,
  fetchImpl: FetchLike,
  now: Date = new Date(),
): Promise<MetricsResult> {
  const cached = await env.RATE_LIMIT.get(METRICS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached) as MetricsResult; } catch { /* fall through */ }
  }
  const byTier: Record<Tier, number> = { free: 0, pro: 0, business: 0, enterprise: 0 };
  let totalMembers = 0;
  let offset = 0;
  const limit = 200;
  for (;;) {
    const page = await listClerkUsersPage(env.CLERK_SECRET_KEY, fetchImpl, offset, limit);
    if (page.length === 0) break;
    for (const u of page) {
      totalMembers += 1;
      byTier[parseTier(u.public_metadata?.tier)] += 1;
    }
    if (page.length < limit) break;
    offset += limit;
  }

  let mrrPence = 0;
  let payingSubscribers = 0;
  for (const status of ['active', 'trialing'] as const) {
    let starting_after: string | undefined;
    for (;;) {
      const page = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after,
        expand: ['data.items.data.price'],
      });
      for (const sub of page.data) {
        const item = sub.items.data[0];
        if (!item?.price) continue;
        const amount = item.price.unit_amount ?? 0;
        const interval = item.price.recurring?.interval ?? 'month';
        const intervalCount = item.price.recurring?.interval_count ?? 1;
        mrrPence += monthlyPence(amount, interval, intervalCount, item.quantity ?? 1);
        payingSubscribers += 1;
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
      if (!starting_after) break;
    }
  }

  const result: MetricsResult = {
    totalMembers,
    byTier,
    mrrPence: Math.round(mrrPence),
    payingSubscribers,
    computedAt: now.getTime(),
  };
  await env.RATE_LIMIT.put(METRICS_CACHE_KEY, JSON.stringify(result), {
    expirationTtl: METRICS_CACHE_TTL_SECONDS,
  });
  return result;
}

function monthlyPence(
  unitAmount: number,
  interval: Stripe.Price.Recurring.Interval,
  intervalCount: number,
  quantity: number,
): number {
  const months = interval === 'year' ? 12 * intervalCount
               : interval === 'month' ? intervalCount
               : interval === 'week' ? intervalCount / 4.345
               : interval === 'day' ? intervalCount / 30.437
               : intervalCount; // fallback — treat unknown as months
  if (months <= 0) return 0;
  return (unitAmount * quantity) / months;
}

export interface ActivityEvent {
  id: string;
  ts: number;
  type: string;
  customerId: string | null;
  summary: string;
}

const ACTIVITY_TYPES: Stripe.Event.Type[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'charge.refunded',
];

/**
 * Recent Stripe lifecycle events. `since` is a unix-seconds timestamp.
 * Returns the most recent first.
 */
export async function getActivity(
  stripe: StripeAdminLike,
  sinceSeconds?: number,
  limit = 50,
): Promise<ActivityEvent[]> {
  const out: ActivityEvent[] = [];
  for (const type of ACTIVITY_TYPES) {
    const page = await stripe.events.list({
      type,
      limit: Math.min(limit, 100),
      ...(sinceSeconds ? { created: { gte: sinceSeconds } } : {}),
    });
    for (const ev of page.data) {
      out.push(normaliseEvent(ev));
    }
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

function normaliseEvent(ev: Stripe.Event): ActivityEvent {
  const data = ev.data.object as unknown as Record<string, unknown>;
  const customerId = typeof data.customer === 'string' ? data.customer : null;
  let summary: string = ev.type;
  if (ev.type === 'checkout.session.completed') {
    const amount = typeof data.amount_total === 'number' ? data.amount_total : 0;
    const currency = (typeof data.currency === 'string' ? data.currency : 'gbp').toUpperCase();
    summary = `Checkout completed — ${formatMoney(amount, currency)}`;
  } else if (ev.type === 'customer.subscription.created') {
    summary = 'Subscription created';
  } else if (ev.type === 'customer.subscription.updated') {
    const status = typeof data.status === 'string' ? data.status : '?';
    const cancelAtPeriodEnd = data.cancel_at_period_end === true;
    summary = cancelAtPeriodEnd
      ? `Subscription set to cancel at period end (status ${status})`
      : `Subscription updated (status ${status})`;
  } else if (ev.type === 'customer.subscription.deleted') {
    summary = 'Subscription canceled';
  } else if (ev.type === 'invoice.payment_failed') {
    summary = 'Invoice payment failed';
  } else if (ev.type === 'charge.refunded') {
    const amount = typeof data.amount_refunded === 'number' ? data.amount_refunded : 0;
    const currency = (typeof data.currency === 'string' ? data.currency : 'gbp').toUpperCase();
    summary = `Refund issued — ${formatMoney(amount, currency)}`;
  }
  return { id: ev.id, ts: ev.created * 1000, type: ev.type, customerId, summary };
}

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  return symbol ? `${symbol}${major.toFixed(2)}` : `${major.toFixed(2)} ${currency}`;
}

/**
 * Comp Pro to a user — flips Clerk publicMetadata.tier to 'pro'. Does NOT
 * create a Stripe subscription (these are manual comps with no payment).
 */
export async function grantPro(
  userId: string,
  env: AdminEnv,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await patchClerkTier(userId, env.CLERK_SECRET_KEY, fetchImpl, 'pro');
  await invalidateTierCache(userId, env.RATE_LIMIT);
}

export async function revokePro(
  userId: string,
  env: AdminEnv,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await patchClerkTier(userId, env.CLERK_SECRET_KEY, fetchImpl, 'free');
  await invalidateTierCache(userId, env.RATE_LIMIT);
}

async function patchClerkTier(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike,
  tier: Tier,
): Promise<void> {
  const cur = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  let existing: Record<string, unknown> = {};
  if (cur.ok) {
    const data = (await cur.json()) as { public_metadata?: Record<string, unknown> };
    existing = data.public_metadata ?? {};
  }
  const merged = { ...existing, tier };
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

/**
 * Cancel a user's active Stripe subscription. Resolves the Clerk userId →
 * stripeCustomerId, picks the first non-canceled subscription, and either
 * sets cancel_at_period_end (graceful) or cancels immediately. The Stripe
 * webhook then flips Clerk tier to 'free' on the resulting event.
 */
export async function cancelUserSubscription(
  userId: string,
  env: AdminEnv,
  stripe: StripeAdminLike,
  fetchImpl: FetchLike,
  atPeriodEnd: boolean,
): Promise<{ subscriptionId: string; status: string; cancelAtPeriodEnd: boolean }> {
  const customerId = await resolveStripeCustomerId(userId, env.CLERK_SECRET_KEY, fetchImpl);
  if (!customerId) throw new Error('No Stripe customer on file for this user');
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  const live = subs.data.find((s) => s.status !== 'canceled' && s.status !== 'incomplete_expired');
  if (!live) throw new Error('No active subscription to cancel');
  if (atPeriodEnd) {
    const updated = await stripe.subscriptions.update(live.id, { cancel_at_period_end: true });
    return { subscriptionId: updated.id, status: updated.status, cancelAtPeriodEnd: updated.cancel_at_period_end };
  }
  const canceled = await stripe.subscriptions.cancel(live.id);
  return { subscriptionId: canceled.id, status: canceled.status, cancelAtPeriodEnd: canceled.cancel_at_period_end };
}

/**
 * Refund the most recent paid charge on a user's Stripe customer. Used for
 * one-off goodwill refunds; for bulk dispute handling, do it in Stripe.
 */
export async function refundLatestCharge(
  userId: string,
  env: AdminEnv,
  stripe: StripeAdminLike,
  fetchImpl: FetchLike,
): Promise<{ refundId: string; amount: number; currency: string }> {
  const customerId = await resolveStripeCustomerId(userId, env.CLERK_SECRET_KEY, fetchImpl);
  if (!customerId) throw new Error('No Stripe customer on file for this user');
  // The Stripe 2026-04-22.dahlia API no longer exposes Invoice.charge — get
  // the customer's most recent succeeded charge directly and refund it.
  const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
  const charge = charges.data.find((c) => c.status === 'succeeded' && !c.refunded);
  if (!charge) throw new Error('No refundable charge found for this customer');
  const refund = await stripe.refunds.create({ charge: charge.id });
  return { refundId: refund.id, amount: refund.amount, currency: refund.currency };
}

async function resolveStripeCustomerId(
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
