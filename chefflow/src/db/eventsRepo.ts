import { db } from './dexie';
import type { KitchenEvent } from '../core/types';

export async function listEvents(): Promise<KitchenEvent[]> {
  const all = await db.events.toArray();
  return all.sort((a, b) => {
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
  return db.events.get(id);
}

export async function saveEvent(event: KitchenEvent): Promise<void> {
  await db.events.put(event);
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}
