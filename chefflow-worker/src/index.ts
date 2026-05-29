import { verifyToken } from '@clerk/backend';
import { verifyClerkRequest, UnauthorizedError } from './auth';
import { consumeQuota, snapshotQuota, isQuotaKind, QuotaExceeded, type QuotaKind } from './quota';
import { fetchUserTier, type FetchLike } from './tier';
import { TIER_LIMITS } from '../../chefflow/src/core/tier/limits';
import { cancelOwnSubscription, createCheckoutSession, createPortalSession, makeStripe, type Interval } from './billing';
import { handleStripeWebhook } from './stripeWebhook';
import {
  requireAdmin,
  listMembers,
  getMetrics,
  getActivity,
  grantPro,
  grantTier,
  revokePro,
  cancelUserSubscription,
  refundLatestCharge,
  AdminForbiddenError,
  type StripeAdminLike,
} from './admin';
import { handleEndpoint, ENDPOINTS, type EndpointName } from './endpoints';
import type { ProxyRequestBody, ProxyResponseBody } from './types';
import {
  publish as communityPublish,
  unpublish as communityUnpublish,
  listRecent as communityListRecent,
  listByAuthor as communityListByAuthor,
  get as communityGet,
  toggleLike as communityToggleLike,
  recordCopy as communityRecordCopy,
  uncopyRecipe as communityUncopyRecipe,
  hasLiked as communityHasLiked,
  CommunityForbidden,
  CommunityNotFound,
  type SourceRecipe,
} from './community';
import {
  submit as contactSubmit,
  listSubmissions as contactListSubmissions,
  ContactValidationError,
  ContactRateLimitError,
} from './contact';
import {
  submit as allergenAuditSubmit,
  listAll as allergenAuditListAll,
  AllergenAuditValidationError,
} from './allergenAudit';
import {
  pull as syncPull,
  push as syncPush,
  parseSince,
  SyncValidationError,
} from './sync';
import { provisionDemosForUser } from './demos';
import { completeOnboarding, OnboardingError, type OnboardingProfile } from './onboarding';
import { setAdminByEmail, AdminBootstrapError } from './setAdminByEmail';
import { runContactDigest } from './contactDigest';
import { runDailyDigest } from './dailyDigest';
import { buildDemoEvents, buildDemoRecipes } from './demoSeed';
import { runGmailDigest } from './gmailDigest';
import { requestPinRecoveryCode, verifyPinRecoveryCode } from './pinRecovery';
import { estimateCommute, CommuteError } from './commute';
import {
  submitReport as takedownSubmitReport,
  listReports as takedownListReports,
  resolveReport as takedownResolveReport,
  TakedownValidationError,
  type SubmitReportInput as TakedownSubmitInput,
  type ReportStatus as TakedownReportStatus,
  type ResolutionAction as TakedownResolutionAction,
} from './takedown';
import { exportAccount } from './accountExport';
import { deleteAccount, AccountDeleteError } from './accountDelete';

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  /** Per-user sync database (recipes / events / menus / allergen audits). */
  DB: D1Database;
  CLERK_ISSUER: string;
  CLERK_SECRET_KEY: string;
  /** Legacy blanket cap, kept for fallback. Per-tier LLM cap supersedes it. */
  DAILY_LIMIT: string;
  // Stripe — all provisioned via `wrangler secret put`.
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_PRO_MONTHLY: string;
  STRIPE_PRICE_ID_PRO_ANNUAL: string;
  // Enterprise tier Stripe price IDs — optional. Provision via
  // `wrangler secret put STRIPE_PRICE_ID_ENTERPRISE_MONTHLY` (and _ANNUAL).
  // The /billing/checkout-session route returns a 500 with a clear message
  // when tier='enterprise' but these are unset, so the SPA can surface a
  // user-friendly failure instead of a silent Stripe blowup.
  STRIPE_PRICE_ID_ENTERPRISE_MONTHLY?: string;
  STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?: string;
  // Resend API key — drives the contact-form notification email path in
  // contact.ts. Optional: when absent, the contact form still works but
  // doesn't email anyone (KV-only). Set via `wrangler secret put RESEND_API_KEY`.
  RESEND_API_KEY?: string;
  // One-shot bearer token gating POST /admin/bootstrap (set + replace
  // admin@chefflow.uk as the sole admin). Optional — when unset the route
  // returns 503. Set via `wrangler secret put ADMIN_BOOTSTRAP_TOKEN`
  // immediately before use, then `wrangler secret delete` after.
  ADMIN_BOOTSTRAP_TOKEN?: string;
  // Gmail OAuth for the daily inbox digest cron (07:30 UTC). All three
  // must be set before the cron will fire — see
  // docs/operations/gmail-oauth-setup.md for the one-time setup. When
  // any are missing the cron logs a 'no-secrets' skip and exits cleanly.
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  // Google Maps Distance Matrix API key — powers POST /api/commute/estimate
  // for the Workflow page commute banner. Optional: when unset the
  // route returns 503 and the SPA hides the banner. Setup:
  // docs/operations/google-maps-api-setup.md.
  GOOGLE_MAPS_API_KEY?: string;
  // Groq API key — when set, routes /api/llm/workflow through Groq +
  // Kimi K2 for stronger reasoning + sub-second latency on workflow
  // generation. Unset → falls back to Workers AI Llama (the previous
  // behaviour). Setup: console.groq.com → API Keys → set via
  // `wrangler secret put GROQ_API_KEY`.
  GROQ_API_KEY?: string;
}

type Verifier = (token: string, opts: { secretKey: string; issuer: string }) => Promise<{ sub: string } | undefined>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Stripe-Signature',
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

  // ---- Public demo content — fuels the signed-out guest browse mode
  // on /recipes + /events. Same canonical demo set that gets provisioned
  // to each chef on first sign-in (buildDemoRecipes / buildDemoEvents).
  // No auth, CDN-cacheable for 5 minutes since the content is static.
  if (req.method === 'GET' && url.pathname === '/demos/list') {
    const now = Date.now();
    return new Response(
      JSON.stringify({
        recipes: buildDemoRecipes(now),
        events: buildDemoEvents(now),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  // ---- Public community reads — anyone with the URL can browse. ----
  if (req.method === 'GET' && url.pathname === '/community/list') {
    const items = await communityListRecent(env.RATE_LIMIT);
    return json({ items }, 200);
  }
  // GET /community/by-author/:clerkId — public chef-profile listing.
  const communityByAuthorMatch = /^\/community\/by-author\/(.+)$/.exec(url.pathname);
  if (req.method === 'GET' && communityByAuthorMatch) {
    const clerkId = decodeURIComponent(communityByAuthorMatch[1]);
    const items = await communityListByAuthor(env.RATE_LIMIT, clerkId);
    return json({ items }, 200);
  }
  const communityGetMatch = /^\/community\/(cr_[A-Za-z0-9_]+)$/.exec(url.pathname);
  if (req.method === 'GET' && communityGetMatch) {
    const record = await communityGet(env.RATE_LIMIT, communityGetMatch[1]);
    if (!record) return json({ error: 'Not found' }, 404);
    return json(record, 200);
  }

  // ---- Public contact form — unauth, IP-rate-limited. ----
  if (req.method === 'POST' && url.pathname === '/contact/submit') {
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const body = await readJson(req);
    try {
      await contactSubmit(env, ip, body);
      return json({ ok: true }, 200);
    } catch (err) {
      if (err instanceof ContactRateLimitError) {
        return json(
          { error: err.message },
          429,
          { 'Retry-After': String(err.retryAfterSeconds) },
        );
      }
      if (err instanceof ContactValidationError) {
        return json({ error: err.message }, err.status);
      }
      const msg = err instanceof Error ? err.message : 'Failed to send';
      return json({ error: msg }, 500);
    }
  }

  // POST /admin/bootstrap?email=… — one-shot endpoint to set / replace
  // the admin user. Gated by the `ADMIN_BOOTSTRAP_TOKEN` worker secret
  // (NOT by Clerk auth) so it works when no admin exists yet — the
  // chicken-and-egg case. Operator workflow:
  //   1. wrangler secret put ADMIN_BOOTSTRAP_TOKEN   (any random hex)
  //   2. curl -X POST -H "Authorization: Bearer <token>" \
  //        "https://api.chefflow.uk/admin/bootstrap?email=admin@chefflow.uk"
  //   3. wrangler secret delete ADMIN_BOOTSTRAP_TOKEN
  // Lives OUTSIDE the Clerk auth gate. The bootstrap token shouldn't sit
  // around — operator is expected to revoke it immediately after use.
  if (req.method === 'POST' && url.pathname === '/admin/bootstrap') {
    const presentToken = env.ADMIN_BOOTSTRAP_TOKEN;
    if (!presentToken) {
      return json({ error: 'admin bootstrap disabled — set ADMIN_BOOTSTRAP_TOKEN secret first' }, 503);
    }
    const auth = req.headers.get('Authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (supplied !== presentToken) {
      return json({ error: 'invalid bootstrap token' }, 401);
    }
    const email = url.searchParams.get('email') ?? '';
    try {
      const result = await setAdminByEmail(email, env.CLERK_SECRET_KEY, fetchImpl);
      return json({ ok: true, ...result }, 200);
    } catch (err) {
      if (err instanceof AdminBootstrapError) {
        return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500);
      }
      const msg = err instanceof Error ? err.message : 'admin bootstrap failed';
      return json({ error: msg }, 500);
    }
  }

  // POST /admin/cron/run?name=daily-digest|gmail-digest|contact-digest
  // — fire a cron handler on-demand for testing. Gated by the
  // ADMIN_BOOTSTRAP_TOKEN secret (set + delete around the call).
  // Wrangler v4 dropped the `triggers cron` CLI so this is the only way
  // to validate a cron without waiting for the scheduled firing.
  //
  //   - `daily-digest`   — the only cron the scheduler fires; combined
  //                        Gmail inbox + contact submissions in ONE email.
  //   - `gmail-digest`   — sends ONLY the inbox section as its own email
  //                        (kept for ad-hoc partial testing).
  //   - `contact-digest` — sends ONLY the contact section as its own email
  //                        (kept for ad-hoc partial testing).
  if (req.method === 'POST' && url.pathname === '/admin/cron/run') {
    const presentToken = env.ADMIN_BOOTSTRAP_TOKEN;
    if (!presentToken) {
      return json({ error: 'admin trigger disabled — set ADMIN_BOOTSTRAP_TOKEN secret first' }, 503);
    }
    const auth = req.headers.get('Authorization') ?? '';
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (supplied !== presentToken) {
      return json({ error: 'invalid bootstrap token' }, 401);
    }
    const name = url.searchParams.get('name') ?? '';
    try {
      if (name === 'daily-digest') {
        const result = await runDailyDigest(env);
        return json({ ok: true, name, result }, 200);
      }
      if (name === 'gmail-digest') {
        const result = await runGmailDigest(env);
        return json({ ok: true, name, result }, 200);
      }
      if (name === 'contact-digest') {
        const result = await runContactDigest(env);
        return json({ ok: true, name, result }, 200);
      }
      return json({ error: `unknown cron name: ${name}` }, 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'cron run failed';
      return json({ error: msg, name }, 500);
    }
  }

  // Auth gates every other route in this worker. Pull userId once up front.
  let userId: string;
  try {
    userId = await verifyClerkRequest(req, env, verify);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
    throw err;
  }

  // ---- Per-user sync (D1). Authed; user_id is taken from the verified token.
  if (req.method === 'GET' && url.pathname === '/api/sync/pull') {
    const since = parseSince(url.searchParams.get('since'));
    try {
      const out = await syncPull(env.DB, userId, since);
      return json(out, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync pull failed';
      return json({ error: msg }, 500);
    }
  }

  // POST /api/commute/estimate — driving-time + distance from the chef's
  // home address to the event location. Powers the Workflow-page
  // commute banner. Auth-required (any signed-in chef); body is
  // { origin: string, destination: string }. Returns
  // { durationSeconds, distanceMeters, resolvedOrigin, resolvedDestination }
  // on success, or { error, fallback } on Maps failure / no-key state.
  if (req.method === 'POST' && url.pathname === '/api/commute/estimate') {
    if (!env.GOOGLE_MAPS_API_KEY) {
      return json({ error: 'maps integration not configured', fallback: 'no-key' }, 503);
    }
    const body = (await readJson(req)) as { origin?: unknown; destination?: unknown } | null;
    const origin = typeof body?.origin === 'string' ? body.origin.trim() : '';
    const destination = typeof body?.destination === 'string' ? body.destination.trim() : '';
    if (!origin || !destination) {
      return json({ error: 'origin and destination must be non-empty strings' }, 400);
    }
    try {
      const result = await estimateCommute({
        apiKey: env.GOOGLE_MAPS_API_KEY,
        origin,
        destination,
        fetchImpl,
      });
      return json(result, 200);
    } catch (err) {
      if (err instanceof CommuteError) {
        return json({ error: err.message, fallback: 'maps-failed' }, err.status ?? 502);
      }
      const msg = err instanceof Error ? err.message : 'commute estimate failed';
      return json({ error: msg, fallback: 'maps-failed' }, 500);
    }
  }

  // POST /api/demos/provision — idempotent first-sign-in demo seed. Any
  // signed-in user can call this; the worker fast-skips repeat calls via a
  // KV marker, and uses INSERT OR IGNORE so user edits/deletes are preserved.
  //
  // POST /api/demos/provision?force=1 — chef-triggered "restore demos"
  // action from Settings. Clears the KV marker first so the seed runs
  // again. Recipes still INSERT OR IGNORE (won't overwrite chef edits);
  // events UPSERT (overwrites the demo event row even if tweaked, which
  // is the intended behaviour — the chef explicitly asked to restore).
  if (req.method === 'POST' && url.pathname === '/api/demos/provision') {
    try {
      const force = url.searchParams.get('force') === '1';
      if (force) {
        // The marker key format is owned by demos.ts; mirror its v5
        // prefix here. (Kept in sync via tests.)
        await env.RATE_LIMIT.delete(`demos:provisioned:v5:${userId}`);
      }
      const result = await provisionDemosForUser({ DB: env.DB, RATE_LIMIT: env.RATE_LIMIT }, userId);
      return json(result, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Demo provision failed';
      return json({ error: msg }, 500);
    }
  }

  // POST /api/onboarding/complete — marks the user's account-setup sheet as
  // finished and (optionally) persists the three profile fields the sheet
  // collects. Idempotent: re-calling just re-sets the flag. The frontend
  // gate reads useUser().publicMetadata.onboardingComplete to decide
  // whether to render the sheet, so this route is what makes the gate
  // cross-device durable.
  if (req.method === 'POST' && url.pathname === '/api/onboarding/complete') {
    const body = (await readJson(req)) as OnboardingProfile | null;
    try {
      const result = await completeOnboarding(
        userId,
        env.CLERK_SECRET_KEY,
        body ?? {},
        fetchImpl,
        {
          db: env.DB,
          ip: req.headers.get('CF-Connecting-IP'),
          userAgent: req.headers.get('User-Agent'),
        },
      );
      return json(result, 200);
    } catch (err) {
      if (err instanceof OnboardingError) {
        return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500);
      }
      const msg = err instanceof Error ? err.message : 'Onboarding completion failed';
      return json({ error: msg }, 500);
    }
  }

  // POST /api/community/report — any signed-in user files a notice-and-
  // takedown report against a published community recipe. Stored in D1
  // takedown_reports for admin review. No PII beyond the reporter's
  // Clerk userId + optional contact email is persisted.
  if (req.method === 'POST' && url.pathname === '/api/community/report') {
    const body = (await readJson(req)) as TakedownSubmitInput | null;
    if (!body) return json({ error: 'invalid body' }, 400);
    try {
      const result = await takedownSubmitReport(env.DB, userId, body);
      return json(result, 200);
    } catch (err) {
      if (err instanceof TakedownValidationError) {
        return json({ error: err.message }, err.status);
      }
      const msg = err instanceof Error ? err.message : 'Report submission failed';
      return json({ error: msg }, 500);
    }
  }

  // GET /api/admin/takedown-reports?status=pending — admin queue. Same
  // gate pattern as the other /api/admin routes via requireAdmin().
  if (req.method === 'GET' && url.pathname === '/api/admin/takedown-reports') {
    try {
      await requireAdmin(userId, env.CLERK_SECRET_KEY, fetchImpl);
    } catch (err) {
      if (err instanceof AdminForbiddenError) return json({ error: err.message }, 403);
      throw err;
    }
    const statusParam = url.searchParams.get('status');
    const status: TakedownReportStatus | undefined =
      statusParam === 'pending' || statusParam === 'resolved' || statusParam === 'dismissed'
        ? statusParam
        : undefined;
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const reports = await takedownListReports(env.DB, { status, limit });
    return json({ reports }, 200);
  }

  // POST /api/admin/takedown-reports/:id/resolve — admin actions a report.
  // Body: { action: 'unpublish' | 'dismiss', note?: string }
  {
    const match = /^\/api\/admin\/takedown-reports\/([^/]+)\/resolve$/.exec(url.pathname);
    if (req.method === 'POST' && match) {
      try {
        await requireAdmin(userId, env.CLERK_SECRET_KEY, fetchImpl);
      } catch (err) {
        if (err instanceof AdminForbiddenError) return json({ error: err.message }, 403);
        throw err;
      }
      const body = (await readJson(req)) as { action?: TakedownResolutionAction; note?: string } | null;
      if (!body || (body.action !== 'unpublish' && body.action !== 'dismiss')) {
        return json({ error: 'action must be unpublish or dismiss' }, 400);
      }
      try {
        const out = await takedownResolveReport(
          env.DB,
          env.RATE_LIMIT,
          userId,
          match[1],
          body.action,
          body.note ?? null,
        );
        return json(out, 200);
      } catch (err) {
        if (err instanceof TakedownValidationError) {
          return json({ error: err.message }, err.status);
        }
        const msg = err instanceof Error ? err.message : 'Resolve failed';
        return json({ error: msg }, 500);
      }
    }
  }

  // GET /api/account/export — GDPR Article 20 portability. Returns one JSON
  // blob with every D1 row the caller owns plus their community recipes.
  if (req.method === 'GET' && url.pathname === '/api/account/export') {
    try {
      const payload = await exportAccount(env.DB, env.RATE_LIMIT, userId);
      return json(payload, 200, {
        'Content-Disposition': `attachment; filename="chefflow-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      return json({ error: msg }, 500);
    }
  }

  // DELETE /api/account — GDPR Article 17 erasure. Cascades through D1,
  // unpublishes community recipes, clears the demos KV marker, then deletes
  // the Clerk user (which revokes all sessions). Irreversible.
  if (req.method === 'DELETE' && url.pathname === '/api/account') {
    try {
      const out = await deleteAccount(env.DB, env.RATE_LIMIT, userId, env.CLERK_SECRET_KEY, fetchImpl);
      return json(out, 200);
    } catch (err) {
      if (err instanceof AccountDeleteError) {
        return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500);
      }
      const msg = err instanceof Error ? err.message : 'Account deletion failed';
      return json({ error: msg }, 500);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/sync/push') {
    const body = await readJson(req);
    try {
      const results = await syncPush(env.DB, userId, body);
      return json({ results, serverNow: Date.now() }, 200);
    } catch (err) {
      if (err instanceof SyncValidationError) {
        return json({ error: err.message }, err.status);
      }
      const msg = err instanceof Error ? err.message : 'Sync push failed';
      return json({ error: msg }, 500);
    }
  }

  // POST /audit/allergen-removal — chef pushes a local audit entry up to the
  // central log. Idempotent on entry.id; safe to retry. The userClerkId on
  // the persisted record is overridden with the verified token's sub —
  // clients can't spoof someone else's removal.
  if (req.method === 'POST' && url.pathname === '/audit/allergen-removal') {
    const body = await readJson(req);
    try {
      const out = await allergenAuditSubmit(env.RATE_LIMIT, userId, body);
      return json(out, 200);
    } catch (err) {
      if (err instanceof AllergenAuditValidationError) {
        return json({ error: err.message }, err.status);
      }
      const msg = err instanceof Error ? err.message : 'Failed to record audit';
      return json({ error: msg }, 500);
    }
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

  // POST /pin/recovery/request — emails a 6-digit recovery code to the
  // chef's primary Clerk email. The PIN itself lives only in the chef's
  // localStorage; this endpoint exists so the chef can prove access to
  // their account before the SPA clears the local PIN. Rate-limited
  // server-side (3/hour/user) via KV counter.
  if (req.method === 'POST' && url.pathname === '/pin/recovery/request') {
    const out = await requestPinRecoveryCode(env, userId, fetchImpl);
    if (out.sent) {
      return json({ ok: true, emailHint: out.emailHint }, 200);
    }
    if (out.skipReason === 'rate-limited') {
      return json({ error: 'Too many recovery attempts — try again in an hour.', reason: 'rate-limited' }, 429);
    }
    if (out.skipReason === 'no-email-on-clerk') {
      return json({ error: 'No verified email on file for this account.', reason: 'no-email' }, 400);
    }
    // Catchall: don't leak the upstream skip reason.
    return json({ error: 'Could not send recovery code.', reason: 'send-failed' }, 502);
  }

  // POST /pin/recovery/verify — body { code }. Returns ok=true on
  // match; the SPA then clears the local PIN. The code is single-use
  // (burned on success).
  if (req.method === 'POST' && url.pathname === '/pin/recovery/verify') {
    const body = (await readJson(req)) as { code?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code : '';
    const out = await verifyPinRecoveryCode(env, userId, code);
    if (out.ok) return json({ ok: true }, 200);
    // Map both "no-code" and "expired" to the same client-facing
    // string so a session-stealing adversary can't enumerate code
    // lifetimes.
    return json({ ok: false, error: 'Invalid or expired code.' }, 400);
  }

  // POST /billing/checkout-session — mint a Stripe Checkout URL.
  if (req.method === 'POST' && url.pathname === '/billing/checkout-session') {
    const body = (await readJson(req)) as { interval?: unknown; tier?: unknown } | null;
    const interval: Interval = body?.interval === 'year' ? 'year' : 'month';
    // Tier picks which price IDs to use. Defaults to 'pro' for backward
    // compat with clients that don't send the new field.
    const tier: 'pro' | 'enterprise' = body?.tier === 'enterprise' ? 'enterprise' : 'pro';
    const origin = req.headers.get('Origin') ?? '';
    if (!origin) return json({ error: 'Missing Origin header' }, 400);

    // Resolve the Stripe price IDs for the requested tier. Enterprise IDs
    // are optional env vars; if unset, fail loud rather than silently
    // routing the chef into a Pro checkout.
    let priceMonthly: string;
    let priceAnnual: string;
    if (tier === 'enterprise') {
      if (!env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY || !env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL) {
        return json({ error: 'Enterprise checkout not configured (missing STRIPE_PRICE_ID_ENTERPRISE_*).' }, 500);
      }
      priceMonthly = env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY;
      priceAnnual = env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL;
    } else {
      priceMonthly = env.STRIPE_PRICE_ID_PRO_MONTHLY;
      priceAnnual = env.STRIPE_PRICE_ID_PRO_ANNUAL;
    }

    try {
      const stripe = makeStripe(env.STRIPE_SECRET_KEY);
      const { url: checkoutUrl } = await createCheckoutSession(
        stripe,
        userId,
        null, // Stripe Checkout will collect the email
        interval,
        `${origin}/settings?upgraded=1`,
        `${origin}/settings`,
        priceMonthly,
        priceAnnual,
      );
      return json({ url: checkoutUrl }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
  }

  // POST /billing/cancel-subscription — flip caller's active sub to
  // cancel_at_period_end. Webhook handles tier flip when Stripe ends it.
  if (req.method === 'POST' && url.pathname === '/billing/cancel-subscription') {
    try {
      const stripe = makeStripe(env.STRIPE_SECRET_KEY);
      const out = await cancelOwnSubscription(stripe, env.CLERK_SECRET_KEY, userId, fetchImpl);
      return json(out, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
  }

  // ---- Admin routes — all gated by Clerk publicMetadata.role === 'admin'. ----
  if (url.pathname.startsWith('/admin/')) {
    try {
      await requireAdmin(userId, env.CLERK_SECRET_KEY, fetchImpl);
    } catch (err) {
      if (err instanceof AdminForbiddenError) return json({ error: err.message }, 403);
      if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
      throw err;
    }

    if (req.method === 'GET' && url.pathname === '/admin/members') {
      const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
      const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
      try {
        const stripe = makeStripe(env.STRIPE_SECRET_KEY) as unknown as StripeAdminLike;
        const out = await listMembers(env, stripe, fetchImpl, offset, limit);
        return json(out, 200);
      } catch (err) {
        return json({ error: errMsg(err) }, 502);
      }
    }

    if (req.method === 'GET' && url.pathname === '/admin/metrics') {
      try {
        const stripe = makeStripe(env.STRIPE_SECRET_KEY) as unknown as StripeAdminLike;
        const out = await getMetrics(env, stripe, fetchImpl);
        return json(out, 200);
      } catch (err) {
        return json({ error: errMsg(err) }, 502);
      }
    }

    if (req.method === 'GET' && url.pathname === '/admin/activity') {
      const since = url.searchParams.get('since');
      const sinceSeconds = since ? parseInt(since, 10) || undefined : undefined;
      try {
        const stripe = makeStripe(env.STRIPE_SECRET_KEY) as unknown as StripeAdminLike;
        const out = await getActivity(stripe, sinceSeconds);
        return json({ events: out }, 200);
      } catch (err) {
        return json({ error: errMsg(err) }, 502);
      }
    }

    if (req.method === 'GET' && url.pathname === '/admin/contact-submissions') {
      const limit = Math.max(
        1,
        Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
      );
      const items = await contactListSubmissions(env.RATE_LIMIT, limit);
      return json({ items }, 200);
    }

    if (req.method === 'GET' && url.pathname === '/admin/allergen-audits') {
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(url.searchParams.get('limit') ?? '200', 10) || 200),
      );
      const items = await allergenAuditListAll(env.RATE_LIMIT, limit);
      return json({ items }, 200);
    }

    // GET /admin/d1/allergen-audits — cross-user view backed by the D1
    // per-user sync table (vs the bespoke-KV one above). Source of truth
    // going forward; the KV view stays for backward compat with any chefs
    // whose audits were pushed via the legacy /audit/allergen-removal route.
    if (req.method === 'GET' && url.pathname === '/admin/d1/allergen-audits') {
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(url.searchParams.get('limit') ?? '200', 10) || 200),
      );
      try {
        const result = await env.DB
          .prepare(
            `SELECT id, user_id, updated_at, payload FROM allergen_audits
             WHERE is_deleted = 0
             ORDER BY updated_at DESC LIMIT ?`,
          )
          .bind(limit)
          .all<{ id: string; user_id: string; updated_at: number; payload: string }>();
        const items = (result.results ?? []).map((row) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(row.payload) as Record<string, unknown>;
          } catch {
            // Skip the parse if payload is malformed; row.id + user_id still
            // useful for an admin to spot trouble.
          }
          // Project the fields the admin panel renders. The userClerkId is
          // taken from the D1 user_id column (authoritative — server-set at
          // sync time), NOT from the payload (which could be tampered with).
          return {
            id: row.id,
            userClerkId: row.user_id,
            updatedAt: row.updated_at,
            recipeId: typeof parsed.recipeId === 'string' ? parsed.recipeId : '',
            recipeTitleAtTime: typeof parsed.recipeTitleAtTime === 'string' ? parsed.recipeTitleAtTime : '',
            removedTag: typeof parsed.removedTag === 'string' ? parsed.removedTag : '',
            reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
            otherText: typeof parsed.otherText === 'string' ? parsed.otherText : undefined,
            ingredientsAtTime: Array.isArray(parsed.ingredientsAtTime) ? parsed.ingredientsAtTime : [],
            removedAt: typeof parsed.removedAt === 'number' ? parsed.removedAt : 0,
            userDisplayName: typeof parsed.userDisplayName === 'string' ? parsed.userDisplayName : undefined,
          };
        });
        return json({ items }, 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'D1 query failed';
        return json({ error: msg }, 500);
      }
    }

    const memberActionMatch = /^\/admin\/members\/([^/]+)\/(grant-pro|grant-enterprise|revoke-pro|cancel-subscription|refund)$/.exec(url.pathname);
    if (req.method === 'POST' && memberActionMatch) {
      const targetUserId = memberActionMatch[1];
      const action = memberActionMatch[2];
      try {
        if (action === 'grant-pro') {
          await grantPro(targetUserId, env, fetchImpl);
          return json({ ok: true, tier: 'pro' }, 200);
        }
        if (action === 'grant-enterprise') {
          await grantTier(targetUserId, 'enterprise', env, fetchImpl);
          return json({ ok: true, tier: 'enterprise' }, 200);
        }
        if (action === 'revoke-pro') {
          await revokePro(targetUserId, env, fetchImpl);
          return json({ ok: true, tier: 'free' }, 200);
        }
        const stripe = makeStripe(env.STRIPE_SECRET_KEY) as unknown as StripeAdminLike;
        if (action === 'cancel-subscription') {
          const body = (await readJson(req)) as { atPeriodEnd?: unknown } | null;
          const atPeriodEnd = body?.atPeriodEnd === true;
          const out = await cancelUserSubscription(targetUserId, env, stripe, fetchImpl, atPeriodEnd);
          return json({ ok: true, ...out }, 200);
        }
        if (action === 'refund') {
          const out = await refundLatestCharge(targetUserId, env, stripe, fetchImpl);
          return json({ ok: true, ...out }, 200);
        }
      } catch (err) {
        return json({ error: errMsg(err) }, 502);
      }
    }

    return json({ error: 'Not found' }, 404);
  }

  // POST /billing/portal-session — mint a Customer Portal URL.
  // Body: { flow?: 'cancel' } — when 'cancel', deep-links to the
  // subscription-cancel page.
  if (req.method === 'POST' && url.pathname === '/billing/portal-session') {
    const origin = req.headers.get('Origin') ?? '';
    if (!origin) return json({ error: 'Missing Origin header' }, 400);
    const body = (await readJson(req)) as { flow?: unknown } | null;
    const flow = body?.flow === 'cancel' ? 'cancel' : undefined;
    try {
      const stripe = makeStripe(env.STRIPE_SECRET_KEY);
      const { url: portalUrl } = await createPortalSession(
        stripe,
        env.CLERK_SECRET_KEY,
        userId,
        `${origin}/settings`,
        fetchImpl,
        flow,
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

  const communityIdRoute = /^\/community\/(cr_[A-Za-z0-9_]+)(\/like|\/copy|\/uncopy)?$/.exec(url.pathname);
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
        const out = await communityRecordCopy(env.RATE_LIMIT, userId, recipeId);
        return json(out, 200);
      } catch (err) {
        if (err instanceof CommunityNotFound) return json({ error: err.message }, 404);
        throw err;
      }
    }

    if (req.method === 'POST' && suffix === '/uncopy') {
      try {
        const out = await communityUncopyRecipe(env.RATE_LIMIT, userId, recipeId);
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
      content = await handleEndpoint(endpoint, env.AI, body, env.GROQ_API_KEY);
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

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  /**
   * Cloudflare cron trigger. Schedules live in `wrangler.toml [triggers]`.
   * Currently one job:
   *   - Daily 08:00 UTC: email admin@chefflow.uk a digest of the past
   *     24h of contact-form submissions (zero-submission days are
   *     skipped — no noise on quiet days).
   *
   * We dispatch by the schedule's cron expression so adding a second
   * job later (say, a weekly takedown digest) is a simple case branch.
   * `event.cron` is the literal string from wrangler.toml.
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const handlers: Record<string, () => Promise<void>> = {
      '0 8 * * *': async () => {
        const result = await runDailyDigest(env);
        console.log('[cron:daily-digest]', JSON.stringify(result));
      },
    };
    const handler = handlers[event.cron];
    if (!handler) {
      console.warn('[cron] unknown schedule', event.cron);
      return;
    }
    ctx.waitUntil(handler());
  },
};
