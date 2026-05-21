import { getWorkerBaseUrl } from '../util/workerBaseUrl';

// ---------------------------------------------------------------------------
// Client for the chefflow-worker /quota endpoints. Modelled on `proxyClient`
// (Clerk JWT via window.Clerk, same Authorization header, same origin
// override for cross-host dev).
//
// Counter writes go through the worker so per-day caps cannot be bypassed
// by clearing IndexedDB or using incognito mode. Snapshot reads power the
// usage meter.
// ---------------------------------------------------------------------------

export type QuotaKind = 'recipe' | 'event' | 'llm';

export interface QuotaSnapshot {
  count: number;
  /** `null` means UNLIMITED (the worker maps Infinity → null over JSON). */
  remaining: number | null;
  limit: number;
}

export interface QuotaSnapshotResponse {
  tier: 'free' | 'pro' | 'business';
  quotas: Record<QuotaKind, QuotaSnapshot>;
}

export class QuotaExceededError extends Error {
  readonly kind: QuotaKind;
  readonly retryAfterSeconds?: number;
  constructor(kind: QuotaKind, retryAfterSeconds?: number) {
    super(`Daily quota exceeded for ${kind}`);
    this.name = 'QuotaExceededError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class QuotaClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'QuotaClientError';
    this.status = status;
  }
}

interface ConsumeOptions {
  kind: QuotaKind;
  origin?: string;
  fetchImpl?: typeof fetch;
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

/**
 * Increment the per-day counter for `kind`. Throws QuotaExceededError on
 * 429 (caller catches → opens UpgradeSheet). Throws QuotaClientError on
 * any other non-2xx.
 *
 * In E2E mode (VITE_E2E_MODE=true) this short-circuits to "allowed,
 * Infinity remaining" — same pattern as UsageMeter and TierSync — so
 * Playwright specs can exercise create flows without needing to mock or
 * stand up the quota worker. Bypass is dev/test-only; the TODO already
 * blocks VITE_E2E_MODE=true from production.
 */
export async function consumeDailyQuota(opts: ConsumeOptions): Promise<QuotaSnapshot> {
  if ((import.meta.env.VITE_E2E_MODE as string | undefined) === 'true') {
    return { count: 0, remaining: null, limit: 0 };
  }
  const token = await getClerkToken();
  if (!token) throw new QuotaClientError('Not signed in', 401);

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${origin}/quota/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: opts.kind }),
  });

  if (res.status === 429) {
    const retry = res.headers.get('Retry-After');
    throw new QuotaExceededError(opts.kind, retry ? parseInt(retry, 10) : undefined);
  }
  if (!res.ok) {
    throw new QuotaClientError(`Quota worker ${res.status}`, res.status);
  }

  const body = (await res.json()) as { count: number; remaining: number | null };
  // limit isn't returned by /consume — derive 0 fallback for callers that
  // ignore it. UsageMeter uses /snapshot instead which does return limit.
  return { count: body.count, remaining: body.remaining, limit: 0 };
}

interface SnapshotOptions {
  origin?: string;
  fetchImpl?: typeof fetch;
}

/** Read-only — does NOT increment. Powers the usage meter. */
export async function getQuotaSnapshot(opts: SnapshotOptions = {}): Promise<QuotaSnapshotResponse> {
  const token = await getClerkToken();
  if (!token) throw new QuotaClientError('Not signed in', 401);

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${origin}/quota/snapshot`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new QuotaClientError(`Quota worker ${res.status}`, res.status);
  return (await res.json()) as QuotaSnapshotResponse;
}

interface BillingOptions {
  origin?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Hit /billing/checkout-session and return the hosted Stripe Checkout URL
 * for the caller to redirect to. Caller does the redirect (window.location
 * assignment is the caller's concern — keeps this testable).
 */
export async function createCheckoutUrl(
  interval: 'month' | 'year',
  opts: BillingOptions = {},
): Promise<string> {
  const token = await getClerkToken();
  if (!token) throw new QuotaClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${origin}/billing/checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ interval }),
  });
  if (!res.ok) throw new QuotaClientError(`Billing worker ${res.status}`, res.status);
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new QuotaClientError('Billing response missing url', 502);
  return body.url;
}

export type PortalFlow = 'cancel';

export interface CancelSubscriptionResponse {
  subscriptionId: string;
  /** Unix seconds — when Pro access actually ends. */
  periodEndUnix: number;
  cancelAtPeriodEnd: boolean;
}

/**
 * Cancel the caller's active subscription at period end. The webhook
 * flips Clerk tier=free when Stripe actually ends the sub on that date.
 */
export async function cancelOwnSubscription(
  opts: BillingOptions = {},
): Promise<CancelSubscriptionResponse> {
  const token = await getClerkToken();
  if (!token) throw new QuotaClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${origin}/billing/cancel-subscription`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = `Billing worker ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) msg = errBody.error;
    } catch { /* ignore */ }
    throw new QuotaClientError(msg, res.status);
  }
  return (await res.json()) as CancelSubscriptionResponse;
}

/**
 * Mint a Customer Portal URL. When `flow === 'cancel'`, Stripe opens
 * directly on the subscription-cancel page.
 */
export async function createPortalUrl(
  flow?: PortalFlow,
  opts: BillingOptions = {},
): Promise<string> {
  const token = await getClerkToken();
  if (!token) throw new QuotaClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${origin}/billing/portal-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(flow ? { flow } : {}),
  });
  if (!res.ok) {
    let msg = `Billing worker ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) msg = errBody.error;
    } catch { /* ignore */ }
    throw new QuotaClientError(msg, res.status);
  }
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new QuotaClientError('Billing response missing url', 502);
  return body.url;
}
