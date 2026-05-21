import { verifyToken } from '@clerk/backend';
import { verifyClerkRequest, UnauthorizedError } from './auth';
import { consumeQuota, snapshotQuota, isQuotaKind, QuotaExceeded, type QuotaKind } from './quota';
import { fetchUserTier, type FetchLike } from './tier';
import { TIER_LIMITS } from './limits';
import { createCheckoutSession, createPortalSession, makeStripe, type Interval } from './billing';
import { handleStripeWebhook } from './stripeWebhook';
import { handleEndpoint, ENDPOINTS, type EndpointName } from './endpoints';
import type { ProxyRequestBody, ProxyResponseBody } from './types';
import {
  publish as communityPublish,
  unpublish as communityUnpublish,
  listRecent as communityListRecent,
  get as communityGet,
  toggleLike as communityToggleLike,
  recordCopy as communityRecordCopy,
  hasLiked as communityHasLiked,
  CommunityForbidden,
  CommunityNotFound,
  type SourceRecipe,
} from './community';

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  CLERK_ISSUER: string;
  CLERK_SECRET_KEY: string;
  /** Legacy blanket cap, kept for fallback. Per-tier LLM cap supersedes it. */
  DAILY_LIMIT: string;
  // Stripe — all provisioned via `wrangler secret put`.
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_PRO_MONTHLY: string;
  STRIPE_PRICE_ID_PRO_ANNUAL: string;
}

type Verifier = (token: string, opts: { secretKey: string; issuer: string }) => Promise<{ sub: string } | undefined>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

function quotaExceededResponse(err: QuotaExceeded): Response {
  return json(
    { error: err.message, kind: err.kind },
    429,
    { 'Retry-After': String(err.retryAfterSeconds) },
  );
}

// Maps each quota kind to its per-day cap for the given tier.
function limitFor(kind: QuotaKind, tier: keyof typeof TIER_LIMITS): number {
  const t = TIER_LIMITS[tier];
  return kind === 'recipe' ? t.maxRecipesPerDay
       : kind === 'event' ? t.maxEventsPerDay
       : t.maxLlmCallsPerDay;
}

/**
 * The actual request handler — exported so tests can drive it directly with
 * a mock Env and an injected Clerk verifier + fetch.
 */
export async function handleRequest(
  req: Request,
  env: Env,
  verify: Verifier = verifyToken as unknown as Verifier,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);

  // POST /webhook/stripe — Stripe signs the body, so this route is NOT
  // behind Clerk auth. Handle BEFORE the JWT verify below.
  if (req.method === 'POST' && url.pathname === '/webhook/stripe') {
    return handleStripeWebhook(req, env, fetchImpl);
  }

  // ---- Public community reads — anyone with the URL can browse. ----
  if (req.method === 'GET' && url.pathname === '/community/list') {
    const items = await communityListRecent(env.RATE_LIMIT);
    return json({ items }, 200);
  }
  const communityGetMatch = /^\/community\/(cr_[A-Za-z0-9_]+)$/.exec(url.pathname);
  if (req.method === 'GET' && communityGetMatch) {
    const record = await communityGet(env.RATE_LIMIT, communityGetMatch[1]);
    if (!record) return json({ error: 'Not found' }, 404);
    return json(record, 200);
  }

  // Auth gates every other route in this worker. Pull userId once up front.
  let userId: string;
  try {
    userId = await verifyClerkRequest(req, env, verify);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
    throw err;
  }

  // POST /quota/consume — increment counter for {kind}.
  if (req.method === 'POST' && url.pathname === '/quota/consume') {
    const body = await readJson(req);
    if (!body || !isQuotaKind((body as { kind?: unknown }).kind)) {
      return json({ error: 'Body must be { kind: "recipe" | "event" | "llm" }' }, 400);
    }
    const kind = (body as { kind: QuotaKind }).kind;
    const tier = await fetchUserTier(userId, env.CLERK_SECRET_KEY, env.RATE_LIMIT, fetchImpl);
    const limit = limitFor(kind, tier);
    try {
      const result = await consumeQuota(env.RATE_LIMIT, userId, kind, limit);
      return json({ allowed: true, ...result, remaining: finiteOrNull(result.remaining) }, 200);
    } catch (err) {
      if (err instanceof QuotaExceeded) return quotaExceededResponse(err);
      throw err;
    }
  }

  // GET /quota/snapshot — read-only; returns counts for all three kinds.
  if (req.method === 'GET' && url.pathname === '/quota/snapshot') {
    const tier = await fetchUserTier(userId, env.CLERK_SECRET_KEY, env.RATE_LIMIT, fetchImpl);
    const kinds: QuotaKind[] = ['recipe', 'event', 'llm'];
    const snapshots = await Promise.all(
      kinds.map(async (kind) => {
        const snap = await snapshotQuota(env.RATE_LIMIT, userId, kind, limitFor(kind, tier));
        return [kind, { count: snap.count, remaining: finiteOrNull(snap.remaining), limit: limitFor(kind, tier) }] as const;
      }),
    );
    return json({ tier, quotas: Object.fromEntries(snapshots) }, 200);
  }

  // POST /billing/checkout-session — mint a Stripe Checkout URL.
  if (req.method === 'POST' && url.pathname === '/billing/checkout-session') {
    const body = (await readJson(req)) as { interval?: unknown } | null;
    const interval: Interval = body?.interval === 'year' ? 'year' : 'month';
    const origin = req.headers.get('Origin') ?? '';
    if (!origin) return json({ error: 'Missing Origin header' }, 400);
    try {
      const stripe = makeStripe(env.STRIPE_SECRET_KEY);
      const { url: checkoutUrl } = await createCheckoutSession(
        stripe,
        userId,
        null, // Stripe Checkout will collect the email
        interval,
        `${origin}/settings?upgraded=1`,
        `${origin}/settings`,
        env.STRIPE_PRICE_ID_PRO_MONTHLY,
        env.STRIPE_PRICE_ID_PRO_ANNUAL,
      );
      return json({ url: checkoutUrl }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
  }

  // POST /billing/portal-session — mint a Customer Portal URL.
  if (req.method === 'POST' && url.pathname === '/billing/portal-session') {
    const origin = req.headers.get('Origin') ?? '';
    if (!origin) return json({ error: 'Missing Origin header' }, 400);
    try {
      const stripe = makeStripe(env.STRIPE_SECRET_KEY);
      const { url: portalUrl } = await createPortalSession(
        stripe,
        env.CLERK_SECRET_KEY,
        userId,
        `${origin}/settings`,
        fetchImpl,
      );
      return json({ url: portalUrl }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
  }

  // ---- Authed community writes. ----
  if (req.method === 'POST' && url.pathname === '/community/publish') {
    const body = (await readJson(req)) as { recipe?: SourceRecipe; displayName?: string } | null;
    if (!body || !body.recipe || typeof body.recipe.title !== 'string') {
      return json({ error: 'Body must be { recipe, displayName }' }, 400);
    }
    try {
      const { id } = await communityPublish(env.RATE_LIMIT, userId, body.displayName ?? '', body.recipe);
      return json({ id }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }

  const communityIdRoute = /^\/community\/(cr_[A-Za-z0-9_]+)(\/like|\/copy)?$/.exec(url.pathname);
  if (communityIdRoute) {
    const recipeId = communityIdRoute[1];
    const suffix = communityIdRoute[2];

    if (req.method === 'DELETE' && !suffix) {
      try {
        await communityUnpublish(env.RATE_LIMIT, userId, recipeId);
        return json({ ok: true }, 200);
      } catch (err) {
        if (err instanceof CommunityNotFound) return json({ error: err.message }, 404);
        if (err instanceof CommunityForbidden) return json({ error: err.message }, 403);
        throw err;
      }
    }

    if (req.method === 'POST' && suffix === '/like') {
      try {
        const out = await communityToggleLike(env.RATE_LIMIT, userId, recipeId);
        return json(out, 200);
      } catch (err) {
        if (err instanceof CommunityNotFound) return json({ error: err.message }, 404);
        throw err;
      }
    }

    if (req.method === 'GET' && suffix === '/like') {
      const liked = await communityHasLiked(env.RATE_LIMIT, userId, recipeId);
      return json({ liked }, 200);
    }

    if (req.method === 'POST' && suffix === '/copy') {
      try {
        const out = await communityRecordCopy(env.RATE_LIMIT, recipeId);
        return json(out, 200);
      } catch (err) {
        if (err instanceof CommunityNotFound) return json({ error: err.message }, 404);
        throw err;
      }
    }
  }

  // POST /api/llm/<endpoint> — original LLM proxy, now tier-aware.
  const llmMatch = /^\/api\/llm\/([a-z]+)\/?$/.exec(url.pathname);
  if (req.method === 'POST' && llmMatch) {
    const endpoint = llmMatch[1] as EndpointName;
    if (!ENDPOINTS.has(endpoint)) return json({ error: 'Unknown endpoint' }, 404);

    // Tier-aware LLM rate limit (replaces the old blanket DAILY_LIMIT).
    const tier = await fetchUserTier(userId, env.CLERK_SECRET_KEY, env.RATE_LIMIT, fetchImpl);
    const limit = limitFor('llm', tier);
    try {
      await consumeQuota(env.RATE_LIMIT, userId, 'llm', limit);
    } catch (err) {
      if (err instanceof QuotaExceeded) return quotaExceededResponse(err);
      throw err;
    }

    let body: ProxyRequestBody;
    try {
      body = (await req.json()) as ProxyRequestBody;
    } catch {
      return json({ error: 'Request body must be JSON' }, 400);
    }
    if (!body.systemPrompt || typeof body.systemPrompt !== 'string') {
      return json({ error: 'systemPrompt is required' }, 400);
    }

    let content: string;
    try {
      content = await handleEndpoint(endpoint, env.AI, body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
    const response: ProxyResponseBody = { content };
    return json(response, 200);
  }

  return json({ error: 'Not found' }, 404);
}

async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}

// JSON.stringify drops Infinity to null already, but doing it explicitly
// makes the response shape predictable for clients.
function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
