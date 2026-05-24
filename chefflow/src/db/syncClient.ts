import { db } from './dexie';
import type { Recipe, KitchenEvent, UserPrefs } from '../core/types';
import { getCurrentUserId } from '../state/currentUser';
import { useSyncStore } from '../state/syncStore';
import { useUnitSystemStore } from '../state/unitSystemStore';
import { suppressNextWrite } from '../state/userPrefsSync';

// Where the worker lives. Default same-origin; tests can override.
const DEFAULT_ORIGIN = '';

type FetchImpl = typeof fetch;
type TokenGetter = () => Promise<string | null>;

interface SyncRow {
  id: string;
  updatedAt: number;
  serverVersion: number;
  deletedAt: number | null;
  payload: Recipe | KitchenEvent | UserPrefs;
}

interface PullResponse {
  recipes: SyncRow[];
  events: SyncRow[];
  prefs?: SyncRow[];   // 0–1 rows; older worker versions may omit
  serverNow: number;
}

interface PushResponse {
  // Per-id serverVersion the server applied — null means the server kept
  // its existing row (incoming was older by updatedAt).
  recipes: Record<string, number | null>;
  events: Record<string, number | null>;
  prefs?: Record<string, number | null>;
  serverNow: number;
}

// Default token getter — pulls from the Clerk SDK on the window object.
// Mirrors chefflow/src/core/llm/proxyClient.ts so the SPA never holds a
// raw API key.
async function defaultGetToken(): Promise<string | null> {
  const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }).Clerk;
  return clerk?.session ? clerk.session.getToken() : null;
}

interface SyncOptions {
  origin?: string;
  fetchImpl?: FetchImpl;
  getToken?: TokenGetter;
}

// Module-level lock: prevents overlapping syncs (the 60s timer + an online
// event firing at the same time). Subsequent callers wait for the in-flight
// run and then return.
let inflight: Promise<void> | null = null;

export async function syncNow(opts: SyncOptions = {}): Promise<void> {
  if (inflight) {
    await inflight;
    return;
  }
  inflight = runSync(opts).finally(() => {
    inflight = null;
  });
  await inflight;
}

async function runSync(opts: SyncOptions): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return; // signed out — nothing to do

  const store = useSyncStore.getState();
  store.setStatus('syncing');

  try {
    await pushDirty(userId, opts);
    await pullSince(userId, opts);
    store.setLastSyncedAt(Date.now());
    store.setStatus('idle');
    store.setLastError(null);
    await refreshPendingCount(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      store.setStatus('offline');
      store.setLastError(null);
    } else {
      store.setStatus('error');
      store.setLastError(msg);
    }
  }
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch network failure
  return false;
}

export async function refreshPendingCount(userId?: string): Promise<void> {
  const uid = userId ?? getCurrentUserId();
  if (!uid) {
    useSyncStore.getState().setPendingCount(0);
    return;
  }
  const [recipesDirty, eventsDirty, prefsDirty] = await Promise.all([
    db.recipes.where('ownerId').equals(uid).filter((r) => r.dirty === true).count(),
    db.events.where('ownerId').equals(uid).filter((e) => e.dirty === true).count(),
    db.userPrefs.where('ownerId').equals(uid).filter((p) => p.dirty === true).count(),
  ]);
  useSyncStore.getState().setPendingCount(recipesDirty + eventsDirty + prefsDirty);
}

async function pushDirty(userId: string, opts: SyncOptions): Promise<void> {
  const [dirtyRecipes, dirtyEvents, dirtyPrefs] = await Promise.all([
    db.recipes.where('ownerId').equals(userId).filter((r) => r.dirty === true).toArray(),
    db.events.where('ownerId').equals(userId).filter((e) => e.dirty === true).toArray(),
    db.userPrefs.where('ownerId').equals(userId).filter((p) => p.dirty === true).toArray(),
  ]);
  if (dirtyRecipes.length === 0 && dirtyEvents.length === 0 && dirtyPrefs.length === 0) return;

  const body = {
    recipes: dirtyRecipes,
    events: dirtyEvents,
    prefs: dirtyPrefs,
  };
  const res = await authedFetch('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify(body),
  }, opts);
  if (!res.ok) throw new Error(`push failed: ${res.status}`);
  const data = (await res.json()) as PushResponse;

  // Clear `dirty` on rows the server accepted. Rows the server rejected
  // (incoming updatedAt < stored) stay dirty so the next pull updates the
  // local copy and the row will not re-push (because pull bumps updatedAt).
  await db.transaction('rw', db.recipes, db.events, db.userPrefs, async () => {
    for (const row of dirtyRecipes) {
      const sv = data.recipes[row.id];
      if (sv !== null && sv !== undefined) {
        const fresh = await db.recipes.get(row.id);
        // Don't clobber edits that happened *during* the push.
        if (fresh && fresh.updatedAt === row.updatedAt) {
          await db.recipes.put({ ...fresh, serverVersion: sv, dirty: false });
        } else if (fresh) {
          // Local edit during push — keep dirty so we push again next cycle.
        }
      }
    }
    for (const row of dirtyEvents) {
      const sv = data.events[row.id];
      if (sv !== null && sv !== undefined) {
        const fresh = await db.events.get(row.id);
        if (fresh && fresh.updatedAt === row.updatedAt) {
          await db.events.put({ ...fresh, serverVersion: sv, dirty: false });
        }
      }
    }
    for (const row of dirtyPrefs) {
      const sv = data.prefs?.[row.id];
      if (sv !== null && sv !== undefined) {
        const fresh = await db.userPrefs.get(row.id);
        if (fresh && fresh.updatedAt === row.updatedAt) {
          await db.userPrefs.put({ ...fresh, serverVersion: sv, dirty: false });
        }
      }
    }
  });
}

async function pullSince(userId: string, opts: SyncOptions): Promise<void> {
  // Use the highest serverVersion we've ever applied as the watermark. We
  // need the max across the tables for the request, but pull each table's
  // delta independently so a slow-changing table doesn't pull the other
  // table's whole history.
  const [recipesMax, eventsMax, prefsMax] = await Promise.all([
    maxServerVersion(db.recipes, userId),
    maxServerVersion(db.events, userId),
    maxServerVersion(db.userPrefs, userId),
  ]);
  const since = Math.min(recipesMax, eventsMax, prefsMax);
  const url = `/api/sync/pull?since=${since}`;
  const res = await authedFetch(url, { method: 'GET' }, opts);
  if (!res.ok) throw new Error(`pull failed: ${res.status}`);
  const data = (await res.json()) as PullResponse;

  await db.transaction('rw', db.recipes, db.events, db.userPrefs, async () => {
    for (const row of data.recipes) {
      if (row.serverVersion <= recipesMax) continue;
      await applyPulledRow(db.recipes, row, userId);
    }
    for (const row of data.events) {
      if (row.serverVersion <= eventsMax) continue;
      await applyPulledRow(db.events, row, userId);
    }
    for (const row of data.prefs ?? []) {
      if (row.serverVersion <= prefsMax) continue;
      await applyPulledRow(db.userPrefs, row, userId);
      // Mirror the pulled prefs into the in-memory store so the UI reflects
      // them immediately (e.g. switching from imperial → metric on another
      // device propagates to this tab on the next sync).
      const payload = row.payload as UserPrefs;
      if (payload.unitSystem) {
        // Tell userPrefsSync this setState is server-originated so its
        // subscription doesn't echo it back to Dexie as a dirty write.
        suppressNextWrite();
        useUnitSystemStore.setState({ system: payload.unitSystem });
      }
    }
  });
}

async function applyPulledRow<T extends Recipe | KitchenEvent | UserPrefs>(
  table: import('dexie').Table<T, string>,
  row: SyncRow,
  userId: string,
): Promise<void> {
  const local = await table.get(row.id);

  // Tombstone — hard delete locally so it doesn't keep appearing. We only
  // accept the tombstone if it's at least as new as the local row; if the
  // user edited locally after the server delete, LWW keeps their edit and
  // the next push will overwrite the tombstone.
  if (row.deletedAt !== null && row.deletedAt !== undefined) {
    if (!local || local.updatedAt <= row.updatedAt) {
      await table.delete(row.id);
    }
    return;
  }

  // Live row — apply unless the user edited locally more recently than the
  // server's copy (their next push will win on LWW).
  if (local && local.updatedAt > row.updatedAt) return;
  await table.put({
    ...(row.payload as T),
    ownerId: userId,
    serverVersion: row.serverVersion,
    dirty: false,
  });
}

async function maxServerVersion(
  table: import('dexie').Table<Recipe | KitchenEvent | UserPrefs, string>,
  userId: string,
): Promise<number> {
  const rows = await table.where('ownerId').equals(userId).toArray();
  let max = 0;
  for (const r of rows) {
    if (r.serverVersion && r.serverVersion > max) max = r.serverVersion;
  }
  return max;
}

async function authedFetch(
  path: string,
  init: RequestInit,
  opts: SyncOptions,
): Promise<Response> {
  const getToken = opts.getToken ?? defaultGetToken;
  const token = await getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? DEFAULT_ORIGIN).replace(/\/+$/, '');
  const url = `${origin}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  return fetchImpl(url, { ...init, headers });
}

// ---------------------------------------------------------------------------
// Account-level operations: data export (GDPR Art. 20) and account deletion
// (GDPR Art. 17). Both share the auth + origin plumbing above.
// ---------------------------------------------------------------------------

export interface ExportPayload {
  ownerId: string;
  exportedAt: number;
  recipes: unknown[];
  events: unknown[];
  prefs: unknown[];
}

export async function exportAccountData(opts: SyncOptions = {}): Promise<ExportPayload> {
  const res = await authedFetch('/api/account/export', { method: 'GET' }, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Export failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as ExportPayload;
}

export interface DeleteSummary {
  deleted: { recipes: number; events: number; user_prefs: number };
}

/**
 * Delete every server-side row owned by the caller, then wipe the local
 * Dexie tables. Does NOT delete the Clerk account itself — the UI is
 * expected to follow up with `user.delete()` (or sign-out) once this
 * resolves.
 */
export async function deleteAccountData(opts: SyncOptions = {}): Promise<DeleteSummary> {
  const res = await authedFetch('/api/account', { method: 'DELETE' }, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Delete failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const summary = (await res.json()) as DeleteSummary;
  // Local wipe — keep this AFTER the server delete so a network failure
  // doesn't leave the user with a half-empty browser but a full server.
  await Promise.all([
    db.recipes.clear(),
    db.events.clear(),
    db.userPrefs.clear(),
  ]);
  useSyncStore.getState().setPendingCount(0);
  return summary;
}
