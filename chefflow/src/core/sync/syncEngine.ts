// Two-way sync orchestrator. Wraps syncClient.pull / push with the local
// Dexie integration: LWW on apply (server row vs local Dexie row), batched
// push of locally-modified rows (synced: false), and cursor management
// against the per-user sync store.
//
// Anatomy of one round-trip (runSync):
//   1. PULL  — GET /api/sync/pull?since=<lastPulledAt>
//              For each table, for each row: LWW vs local Dexie.
//              Tombstones (is_deleted=1) become local rows with isDeleted: true.
//              Update store.lastPulledAt = serverNow.
//   2. PUSH  — Scan Dexie for rows where synced !== true, batched per table.
//              POST /api/sync/push.
//              For each 'applied' result, flip the local row's synced -> true.
//              Stale + rejected rows stay synced=false; next round retries.
//   3. UPDATE store.status / lastError so the UI can show a banner.
//
// The hook (useSyncEngine) wires triggers: on mount, every 30s, on focus, on
// `online` event, and after a debounce when local writes are detected (via
// a Dexie hook on `creating`/`updating` events, registered once).

import { liveQuery, type Table } from 'dexie';
import { db } from '../../db/dexie';
import { isSignedIn, getCurrentUserId } from '../auth/getCurrentUserId';
import { pull, push, type PushBody, type PushRowInput, type SyncTable } from './syncClient';
import type { Recipe, KitchenEvent, Menu, AllergenAuditEntry, SyncMeta } from '../types';

interface SyncStoreLike {
  lastPulledAt: number;
  setLastPulledAt(n: number): void;
  setLastPushedAt(n: number): void;
  setStatus(s: 'idle' | 'syncing' | 'error'): void;
  setLastError(s: string | null): void;
}

interface SyncEngineDeps {
  store: SyncStoreLike;
  /** Override for tests. */
  pullFn?: typeof pull;
  pushFn?: typeof push;
}

const MAX_ROWS_PER_PUSH = 100; // server allows up to 200; keep some headroom.

// A row that participates in sync — owns updatedAt for LWW + SyncMeta fields.
// Recipe/KitchenEvent/Menu all have `updatedAt: number`. AllergenAuditEntry
// uses `removedAt` instead — we adapt by reading whichever is present.
type AnyEntity = (Recipe | KitchenEvent | Menu | AllergenAuditEntry) & SyncMeta;

interface TableSpec {
  /** SQL-side name used by the worker. */
  serverTable: SyncTable;
  /** Dexie table accessor. Cast to a generic `AnyEntity` table so the engine
   *  can treat all four uniformly. */
  dexieTable: () => Table<AnyEntity, string>;
}

const TABLES: TableSpec[] = [
  { serverTable: 'recipes', dexieTable: () => db.recipes as unknown as Table<AnyEntity, string> },
  { serverTable: 'events', dexieTable: () => db.events as unknown as Table<AnyEntity, string> },
  { serverTable: 'menus', dexieTable: () => db.menus as unknown as Table<AnyEntity, string> },
  { serverTable: 'allergen_audits', dexieTable: () => db.allergenAudits as unknown as Table<AnyEntity, string> },
];

/** Read `updatedAt` if present; fall back to `removedAt` for allergen-audit
 *  rows. Anything else is treated as never-updated (0). */
function timestampOf(row: AnyEntity): number {
  if ('updatedAt' in row && typeof row.updatedAt === 'number') return row.updatedAt;
  if ('removedAt' in row && typeof row.removedAt === 'number') return row.removedAt;
  return 0;
}

// ---------------------------------------------------------------------------
// Public API — one round of sync.
// ---------------------------------------------------------------------------
export async function runSync(deps: SyncEngineDeps): Promise<void> {
  if (!isSignedIn()) return; // anon users never sync.
  const userId = getCurrentUserId();
  const { store, pullFn = pull, pushFn = push } = deps;

  store.setStatus('syncing');
  store.setLastError(null);
  try {
    // ---- Phase 1: PULL ----
    const pullResp = await pullFn(store.lastPulledAt);
    await applyPullToDexie(userId, pullResp);
    store.setLastPulledAt(pullResp.serverNow);

    // ---- Phase 2: PUSH ----
    const pending = await collectPending();
    if (Object.values(pending).some((arr) => arr.length > 0)) {
      const pushResp = await pushFn(pending);
      await markAppliedLocally(pushResp.results);
      store.setLastPushedAt(pushResp.serverNow);
    }

    store.setStatus('idle');
  } catch (err) {
    store.setStatus('error');
    store.setLastError(err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// PULL → Dexie apply with LWW per row.
// ---------------------------------------------------------------------------
async function applyPullToDexie(
  currentUserId: string,
  resp: Awaited<ReturnType<typeof pull>>,
): Promise<void> {
  const buckets: Array<{ serverTable: SyncTable; rows: typeof resp.recipes }> = [
    { serverTable: 'recipes', rows: resp.recipes },
    { serverTable: 'events', rows: resp.events },
    { serverTable: 'menus', rows: resp.menus },
    { serverTable: 'allergen_audits', rows: resp.allergen_audits },
  ];

  for (const { serverTable, rows } of buckets) {
    if (rows.length === 0) continue;
    const spec = TABLES.find((t) => t.serverTable === serverTable);
    if (!spec) continue;
    const table = spec.dexieTable();

    for (const serverRow of rows) {
      const existing = (await table.get(serverRow.id)) as AnyEntity | undefined;
      const localTs = existing ? timestampOf(existing) : 0;
      if (serverRow.updated_at <= localTs) {
        // LWW: server isn't newer — leave local alone. The next push will
        // upload the local copy if it's actually newer.
        continue;
      }
      let parsed: AnyEntity;
      try {
        parsed = JSON.parse(serverRow.payload) as AnyEntity;
      } catch {
        continue; // skip malformed payloads — log silently for v1.
      }
      // Stamp the server's authoritative metadata onto the row we persist.
      // userId is enforced server-side, but we re-stamp defensively so a
      // future tab-local hijack of the userId in payload can't sneak past.
      parsed.userId = currentUserId;
      // Keep updatedAt fields in sync with the server's authoritative
      // timestamp — the field name differs across entity types so write
      // to whichever exists, plus add a generic synced flag.
      if ('updatedAt' in parsed) {
        (parsed as Recipe | KitchenEvent | Menu).updatedAt = serverRow.updated_at;
      }
      parsed.isDeleted = serverRow.is_deleted === 1;
      parsed.synced = true;
      await table.put(parsed);
    }
  }
}

// ---------------------------------------------------------------------------
// PUSH — collect locally-modified rows, batched per table, capped per call.
// ---------------------------------------------------------------------------
async function collectPending(): Promise<PushBody> {
  const userId = getCurrentUserId();
  const body: PushBody = {};

  for (const spec of TABLES) {
    const table = spec.dexieTable();
    // Dexie's `where('synced').notEqual(true)` doesn't index well for boolean;
    // grab all rows for this user then filter. At v1 scale (<1k rows/user)
    // this is faster than maintaining an index.
    const all = (await table.toArray()) as AnyEntity[];
    const pending = all.filter((r) => {
      // Skip rows that belong to a different user (cross-user fence at sync).
      // Anonymous rows (no userId) shouldn't push — they belong to a
      // pre-sign-in session that hasn't been adopted yet (Workstream F
      // will adopt them; the sync engine ignores them until then).
      if (!r.userId) return false;
      if (r.userId !== userId) return false;
      return r.synced !== true;
    });
    if (pending.length === 0) continue;
    const rows: PushRowInput[] = pending.slice(0, MAX_ROWS_PER_PUSH).map((r) => ({
      id: r.id,
      updated_at: timestampOf(r),
      is_deleted: r.isDeleted === true,
      payload: r,
    }));
    body[spec.serverTable] = rows;
  }

  return body;
}

async function markAppliedLocally(
  results: Awaited<ReturnType<typeof push>>['results'],
): Promise<void> {
  for (const r of results) {
    if (r.status !== 'applied') continue;
    const spec = TABLES.find((t) => t.serverTable === r.table);
    if (!spec) continue;
    const table = spec.dexieTable();
    const existing = (await table.get(r.id)) as AnyEntity | undefined;
    if (!existing) continue;
    await table.put({ ...existing, synced: true });
  }
}

// ---------------------------------------------------------------------------
// Triggers — debounced push on local writes, periodic + focus/online pulls.
// ---------------------------------------------------------------------------
const PUSH_DEBOUNCE_MS = 2_000;
const PULL_INTERVAL_MS = 30_000;

/**
 * Wire up sync-engine triggers. Caller passes a `runOnce` callback that does
 * one round-trip (closes over the store). Returns an unsubscribe fn.
 */
export function registerSyncTriggers(runOnce: () => void): () => void {
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncePush = () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      runOnce();
    }, PUSH_DEBOUNCE_MS);
  };

  // Periodic pull.
  const intervalId = setInterval(runOnce, PULL_INTERVAL_MS);

  // Focus / online → opportunistic pull.
  const onFocus = () => runOnce();
  const onOnline = () => runOnce();
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);

  // Local write → debounced push. liveQuery emits whenever a watched table
  // is mutated; we just trigger a sync round (the round's PUSH phase
  // collects + sends pending rows).
  const sub = liveQuery(async () => {
    // Touch each table so Dexie tracks all four as dependencies.
    await db.recipes.count();
    await db.events.count();
    await db.menus.count();
    await db.allergenAudits.count();
    return 1;
  }).subscribe({ next: debouncePush });

  return () => {
    clearInterval(intervalId);
    if (pushTimer) clearTimeout(pushTimer);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
    sub.unsubscribe();
  };
}
