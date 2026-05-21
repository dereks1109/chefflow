import { parseTier, type Tier } from './limits';

// Injectable fetch for tests. Production calls the real global fetch.
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const CACHE_TTL_SECONDS = 60; // Re-read tier from Clerk at most once a minute.

/**
 * Read the user's tier from Clerk publicMetadata. Brief KV cache so we
 * don't hit Clerk on every quota check. Fails closed: any error → 'free',
 * so a Clerk outage downgrades quotas rather than letting them sneak past.
 */
export async function fetchUserTier(
  userId: string,
  clerkSecret: string,
  kv: KVNamespace,
  fetchImpl: FetchLike = fetch,
): Promise<Tier> {
  const cacheKey = `tier:${userId}`;
  const cached = await kv.get(cacheKey);
  if (cached) return parseTier(cached);

  let tier: Tier = 'free';
  try {
    const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (res.ok) {
      const user = (await res.json()) as { public_metadata?: { tier?: unknown } };
      tier = parseTier(user.public_metadata?.tier);
    }
  } catch {
    // Swallow — tier stays 'free'.
  }

  await kv.put(cacheKey, tier, { expirationTtl: CACHE_TTL_SECONDS });
  return tier;
}

/** Drop the cached tier for a user — called after a Stripe webhook write. */
export async function invalidateTierCache(userId: string, kv: KVNamespace): Promise<void> {
  await kv.delete(`tier:${userId}`);
}
