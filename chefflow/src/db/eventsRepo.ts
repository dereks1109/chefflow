import { liveQuery } from 'dexie';
import { db } from './dexie';
import { getCurrentUserId } from '../core/auth/getCurrentUserId';
import type { KitchenEvent } from '../core/types';

// See recipesRepo.ts for the userId-scoping + soft-delete + sync rationale.
// All four repos follow the same shape so the sync engine can treat them
// uniformly: stamp `userId`, bump `updatedAt`, flip `synced: false` on
// every write; filter `userId` and `isDeleted` on every read.

/** Live subscription — see subscribeRecipes for rationale. */
export function subscribeEvents(cb: (rows: KitchenEvent[]) => void): () => void {
  const observable = liveQuery(() => listEvents());
  const sub = observable.subscribe({
    next: cb,
    error: (err) => {
      // eslint-disable-next-line no-console
      console.warn('[eventsRepo] subscribeEvents errored', err);
    },
  });
  return () => sub.unsubscribe();
}

export async function listEvents(): Promise<KitchenEvent[]> {
  const userId = getCurrentUserId();
  const all = await db.events.toArray();
  return all
    .filter((e) => !e.isDeleted && (!e.userId || e.userId === userId))
    .sort((a, b) => {
      // Upcoming events (with serveAt) first, chronologically.
      // Unscheduled events go to the end, sorted by updatedAt desc within that group.
      const aHas = Boolean(a.serveAt);
      const bHas = Boolean(b.serveAt);
      if (aHas && bHas) return a.serveAt!.localeCompare(b.serveAt!);
      if (aHas) return -1;
      if (bHas) return 1;
      return b.updatedAt - a.updatedAt;
    });
}

export async function getEvent(id: string): Promise<KitchenEvent | undefined> {
  const userId = getCurrentUserId();
  const e = await db.events.get(id);
  if (!e) return undefined;
  if (e.userId && e.userId !== userId) return undefined;
  if (e.isDeleted) return undefined;
  return e;
}

export async function saveEvent(event: KitchenEvent): Promise<void> {
  const userId = getCurrentUserId();
  await db.events.put({
    ...event,
    userId: event.userId ?? userId,
    updatedAt: event.updatedAt > 0 ? event.updatedAt : Date.now(),
    synced: false,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const existing = await db.events.get(id);
  if (!existing) return;
  const userId = getCurrentUserId();
  await db.events.put({
    ...existing,
    userId: existing.userId ?? userId,
    isDeleted: true,
    updatedAt: Date.now(),
    synced: false,
  });
}
