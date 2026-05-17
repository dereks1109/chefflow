const TTL_SECONDS = 26 * 60 * 60; // 26h — survives the UTC-day boundary

export class RateLimitExceeded extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Daily quota exceeded');
    this.name = 'RateLimitExceeded';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface QuotaResult {
  count: number;
  remaining: number;
}

/**
 * Increment the per-user-per-UTC-day quota counter and return the new count.
 * KV has no atomic INCR; read-then-put is fine at 30/day-per-user scale.
 * Throws RateLimitExceeded when the limit is reached.
 */
export async function consumeDailyQuota(
  kv: KVNamespace,
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaResult> {
  const key = `rl:${userId}:${utcDateKey(now)}`;
  const current = await kv.get(key);
  const count = (current ? parseInt(current, 10) : 0) + 1;
  if (count > limit) {
    throw new RateLimitExceeded(secondsUntilUtcMidnight(now));
  }
  await kv.put(key, String(count), { expirationTtl: TTL_SECONDS });
  return { count, remaining: limit - count };
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilUtcMidnight(d: Date): number {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}
