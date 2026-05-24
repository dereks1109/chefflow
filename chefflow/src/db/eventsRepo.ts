import { db } from './dexie';
import type { KitchenEvent } from '../core/types';
import { requireCurrentUserId } from '../state/currentUser';

export async function listEvents(): Promise<KitchenEvent[]> {
  const userId = requireCurrentUserId();
  const all = await db.events.where('ownerId').equals(userId).toArray();
  const live = all.filter((e) => !e.deletedAt);
  return live.sort((a, b) => {
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
  const userId = requireCurrentUserId();
  const e = await db.events.get(id);
  if (!e || e.ownerId !== userId || e.deletedAt) return undefined;
  return e;
}

export async function saveEvent(event: KitchenEvent): Promise<void> {
  const userId = requireCurrentUserId();
  await db.events.put({
    ...event,
    ownerId: userId,
    updatedAt: Date.now(),
    dirty: true,
  });
}

// Soft delete — see recipesRepo.deleteRecipe for the rationale.
export async function deleteEvent(id: string): Promise<void> {
  const userId = requireCurrentUserId();
  const e = await db.events.get(id);
  if (!e || e.ownerId !== userId) return;
  const now = Date.now();
  await db.events.put({
    ...e,
    deletedAt: now,
    updatedAt: now,
    dirty: true,
  });
}
