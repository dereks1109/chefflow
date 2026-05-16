import { verifyToken } from '@clerk/backend';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

interface ClerkConfig {
  CLERK_ISSUER: string;
  CLERK_SECRET_KEY: string;
}

// Injected verifier signature — matches Clerk's verifyToken so tests can stub.
type TokenVerifier = (
  token: string,
  opts: { secretKey: string; issuer: string },
) => Promise<{ sub: string } | undefined>;

/**
 * Verify the request's Clerk JWT and return the authenticated userId.
 * Throws UnauthorizedError on any failure (missing header, bad shape,
 * bad signature, wrong issuer, expired token, missing sub claim).
 *
 * Uses Clerk's secretKey (`sk_test_…` / `sk_live_…`) — the SDK fetches the
 * JWKS public keys automatically and caches per isolate. Trades a one-time
 * ~50ms JWKS fetch on cold start for a much simpler setup vs. shipping the
 * PEM manually as a wrangler secret.
 */
export async function verifyClerkRequest(
  req: Request,
  env: ClerkConfig,
  verify: TokenVerifier = verifyToken as unknown as TokenVerifier,
): Promise<string> {
  const header = req.headers.get('Authorization');
  if (!header) throw new UnauthorizedError('Missing Authorization header');
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) throw new UnauthorizedError('Authorization header must be Bearer-shaped');
  const token = match[1].trim();
  try {
    const claims = await verify(token, {
      secretKey: env.CLERK_SECRET_KEY,
      issuer: env.CLERK_ISSUER,
    });
    if (!claims?.sub) throw new UnauthorizedError('Token missing sub claim');
    return claims.sub;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new UnauthorizedError(`JWT verification failed: ${msg}`);
  }
}
