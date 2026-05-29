// HTTP wrappers for the /api/sync/* worker routes. Auth via Clerk JWT pulled
// fresh on each call. Mirrors the shape of proxyClient.ts.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface SyncRow {
  id: string;
  updated_at: number;
  is_deleted: 0 | 1;
  /** JSON-serialised entity row (Recipe / KitchenEvent / Menu / AllergenAuditEntry). */
  payload: string;
  /** Team-share marker (T3c Phase 3). Set when the row belongs to another
   *  user the caller is an accepted team viewer of. The sync engine
   *  stamps this onto the local Dexie row so the UI can render a
   *  "Shared by" badge and the push collector can skip it. */
  owner_user_id?: string;
  /** 1 when read-only (paired with owner_user_id today). */
  read_only?: 0 | 1;
}

export interface PullResponse {
  recipes: SyncRow[];
  events: SyncRow[];
  menus: SyncRow[];
  allergen_audits: SyncRow[];
  /** Server clock at response time; client persists as `lastPulledAt`. */
  serverNow: number;
}

export type SyncTable = 'recipes' | 'events' | 'menus' | 'allergen_audits';

export interface PushRowInput {
  id: string;
  updated_at: number;
  is_deleted?: boolean;
  payload: unknown;
}

export interface PushBody {
  recipes?: PushRowInput[];
  events?: PushRowInput[];
  menus?: PushRowInput[];
  allergen_audits?: PushRowInput[];
}

export type PushOutcome = 'applied' | 'stale' | 'rejected';

export interface PushResultRow {
  table: SyncTable;
  id: string;
  status: PushOutcome;
  reason?: string;
}

export interface PushResponse {
  results: PushResultRow[];
  serverNow: number;
}

export class SyncClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SyncClientError';
    this.status = status;
  }
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

function isE2E(): boolean {
  return (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
}

interface Opts {
  origin?: string;
  fetchImpl?: typeof fetch;
}

function originOf(opts: Opts): string {
  return (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
}

/**
 * Fetch all rows for the signed-in user whose `updated_at` is greater than
 * `since`. Empty PullResponse in E2E mode (Playwright runs against a stub
 * server; sync would otherwise be a noisy no-op).
 */
export async function pull(since: number, opts: Opts = {}): Promise<PullResponse> {
  if (isE2E()) {
    return { recipes: [], events: [], menus: [], allergen_audits: [], serverNow: Date.now() };
  }
  const token = await getClerkToken();
  if (!token) throw new SyncClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const url = `${originOf(opts)}/api/sync/pull?since=${encodeURIComponent(String(Math.max(0, Math.floor(since))))}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new SyncClientError(`Sync pull ${res.status}`, res.status);
  return (await res.json()) as PullResponse;
}

/**
 * Upload a batch of client-side deltas. Server applies LWW per row and returns
 * a per-row outcome so the caller can flip local `synced` only on 'applied'.
 */
export async function push(body: PushBody, opts: Opts = {}): Promise<PushResponse> {
  if (isE2E()) {
    // In E2E mode, treat the push as applied locally — no server round-trip.
    const results: PushResultRow[] = [];
    for (const table of ['recipes', 'events', 'menus', 'allergen_audits'] as SyncTable[]) {
      for (const row of body[table] ?? []) {
        results.push({ table, id: row.id, status: 'applied' });
      }
    }
    return { results, serverNow: Date.now() };
  }
  const token = await getClerkToken();
  if (!token) throw new SyncClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const url = `${originOf(opts)}/api/sync/push`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SyncClientError(`Sync push ${res.status}`, res.status);
  return (await res.json()) as PushResponse;
}
