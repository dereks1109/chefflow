import { UNLIMITED } from '../../chefflow/src/core/tier/limits';

const TTL_SECONDS = 26 * 60 * 60; // 26h — survives the UTC-day boundary

export type QuotaKind = 'recipe' | 'event' | 'llm';

const QUOTA_KINDS: readonly QuotaKind[] = ['recipe', 'event', 'llm'] as const;

export function isQuotaKind(s: unknown): s is QuotaKind {
  return typeof s === 'string' && (QUOTA_KINDS as readonly string[]).includes(s);
}

export class QuotaExceeded extends Error {
  readonly retryAfterSeconds: number;
  readonly kind: QuotaKind;
  constructor(kind: QuotaKind, retryAfterSeconds: number) {
    super(`Daily quota exceeded for ${kind}`);
    this.name = 'QuotaExceeded';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface QuotaResult {
  count: number;
  /** Number of operations left today. `Infinity` when the limit is UNLIMITED. */
  remaining: number;
}

/**
 * Increment the per-user-per-UTC-day counter for `kind` and return the new
 * count. KV has no atomic INCR; read-then-put is fine at this scale.
 * `limit === UNLIMITED` (-1) short-circuits — no counter touched.
 * Throws QuotaExceeded when count would exceed limit.
 */
export async function consumeQuota(
  kv: KVNamespace,
  userId: string,
  kind: QuotaKind,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaResult> {
  if (limit === UNLIMITED) return { count: 0, remaining: Infinity };
  const key = `q:${kind}:${userId}:${utcDateKey(now)}`;
  const current = await kv.get(key);
  const count = (current ? parseInt(current, 10) : 0) + 1;
  if (count > limit) {
    throw new QuotaExceeded(kind, secondsUntilUtcMidnight(now));
  }
  await kv.put(key, String(count), { expirationTtl: TTL_SECONDS });
  return { count, remaining: limit - count };
}

/** Read-only snapshot (for the UsageMeter). Does NOT increment. */
export async function snapshotQuota(
  kv: KVNamespace,
  userId: string,
  kind: QuotaKind,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaResult> {
  if (limit === UNLIMITED) return { count: 0, remaining: Infinity };
  const key = `q:${kind}:${userId}:${utcDateKey(now)}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;
  return { count, remaining: Math.max(0, limit - count) };
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilUtcMidnight(d: Date): number {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}
