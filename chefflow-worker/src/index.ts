import { verifyToken } from '@clerk/backend';
import { verifyClerkRequest, UnauthorizedError } from './auth';
import { consumeDailyQuota, RateLimitExceeded } from './rateLimit';
import { handleEndpoint, ENDPOINTS, type EndpointName } from './endpoints';
import { handlePull, handlePush, type PushBody } from './sync';
import { handleDeleteAccount, handleExportAccount } from './account';
import type { ProxyRequestBody, ProxyResponseBody } from './types';

// PII logging policy: never log request bodies on auth-gated endpoints
// (/api/sync/*, /api/account/*, /api/llm/*). Their payloads contain
// recipe ingredients, event contact info, dietary notes, and recipe
// content — none of which should appear in Worker tail logs. If a
// future contributor needs to log something for debugging, log a hash
// or row count, not the body. Cloudflare's platform-level HTTP log
// metadata (IP, method, status) is out of our control; see THIRD_PARTY_NOTICES.md.

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  DB: D1Database;
  CLERK_ISSUER: string;
  CLERK_SECRET_KEY: string;
  DAILY_LIMIT: string;
}

type Verifier = (token: string, opts: { secretKey: string; issuer: string }) => Promise<{ sub: string } | undefined>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

/**
 * The actual request handler — exported so tests can drive it directly with
 * a mock Env and an injected Clerk verifier (the default verifier requires
 * a real JWT). Production goes through the default export below, which
 * always uses Clerk's real verifyToken.
 */
export async function handleRequest(
  req: Request,
  env: Env,
  verify: Verifier = verifyToken as unknown as Verifier,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);

  // Health endpoint — no auth, no rate limit. Returns 200 + a tiny JSON
  // payload. Intended for UptimeRobot / Cloudflare healthchecks and the
  // post-deploy smoke test in DEPLOY.md. Don't leak environment info here.
  if (url.pathname === '/api/health' || url.pathname === '/api/health/') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    return json({ ok: true, service: 'chefflow-llm-proxy' }, 200);
  }

  // Sync routes — auth-only (no rate limit). Owner isolation is enforced in
  // the SQL itself: every query filters on `owner_id = ?` from the JWT.
  const syncMatch = /^\/api\/sync\/(pull|push)\/?$/.exec(url.pathname);
  if (syncMatch) {
    let userId: string;
    try {
      userId = await verifyClerkRequest(req, env, verify);
    } catch (err) {
      if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
      throw err;
    }
    const op = syncMatch[1];
    if (op === 'pull') {
      if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const sinceParam = url.searchParams.get('since');
      const since = sinceParam ? parseInt(sinceParam, 10) || 0 : 0;
      try {
        const data = await handlePull(env.DB, userId, since);
        return json(data, 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg }, 500);
      }
    }
    // push
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body: PushBody;
    try {
      body = (await req.json()) as PushBody;
    } catch {
      return json({ error: 'Request body must be JSON' }, 400);
    }
    try {
      const data = await handlePush(env.DB, userId, body);
      return json(data, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }

  // Account routes — auth-only (no rate limit). Same owner-isolation
  // pattern as sync: the JWT's `sub` claim filters every query.
  if (/^\/api\/account\/?$/.test(url.pathname) && req.method === 'DELETE') {
    let userId: string;
    try {
      userId = await verifyClerkRequest(req, env, verify);
    } catch (err) {
      if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
      throw err;
    }
    try {
      const data = await handleDeleteAccount(env.DB, userId);
      return json(data, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }

  if (/^\/api\/account\/export\/?$/.test(url.pathname)) {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    let userId: string;
    try {
      userId = await verifyClerkRequest(req, env, verify);
    } catch (err) {
      if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
      throw err;
    }
    try {
      const data = await handleExportAccount(env.DB, userId);
      return json(data, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }

  const match = /^\/api\/llm\/([a-z]+)\/?$/.exec(url.pathname);
  if (!match) return json({ error: 'Not found' }, 404);

  const endpoint = match[1] as EndpointName;
  if (!ENDPOINTS.has(endpoint)) return json({ error: 'Unknown endpoint' }, 404);

  // 1) Auth — Clerk JWT
  let userId: string;
  try {
    userId = await verifyClerkRequest(req, env, verify);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
    throw err;
  }

  // 2) Rate limit
  const limit = parseInt(env.DAILY_LIMIT, 10) || 30;
  try {
    await consumeDailyQuota(env.RATE_LIMIT, userId, limit);
  } catch (err) {
    if (err instanceof RateLimitExceeded) {
      return json(
        { error: err.message },
        429,
        { 'Retry-After': String(err.retryAfterSeconds) },
      );
    }
    throw err;
  }

  // 3) Parse + dispatch
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
