import { verifyToken } from '@clerk/backend';
import { verifyClerkRequest, UnauthorizedError } from './auth';
import { consumeDailyQuota, RateLimitExceeded } from './rateLimit';
import { handleEndpoint, ENDPOINTS, type EndpointName } from './endpoints';
import type { ProxyRequestBody, ProxyResponseBody } from './types';

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  CLERK_ISSUER: string;
  CLERK_JWT_KEY: string;
  DAILY_LIMIT: string;
}

type Verifier = (token: string, opts: { jwtKey: string; issuer: string }) => Promise<{ sub: string } | undefined>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
