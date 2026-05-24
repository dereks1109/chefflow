import { db } from './dexie';
import { getCurrentUserId } from '../core/auth/getCurrentUserId';
import type { Menu } from '../core/types';

// See recipesRepo.ts for the userId-scoping + soft-delete + sync rationale.

export async function listMenus(): Promise<Menu[]> {
  const userId = getCurrentUserId();
  const all = await db.menus.toArray();
  return all
    .filter((m) => !m.isDeleted && (!m.userId || m.userId === userId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMenu(id: string): Promise<Menu | undefined> {
  const userId = getCurrentUserId();
  const m = await db.menus.get(id);
  if (!m) return undefined;
  if (m.userId && m.userId !== userId) return undefined;
  if (m.isDeleted) return undefined;
  return m;
}

export async function saveMenu(menu: Menu): Promise<void> {
  const userId = getCurrentUserId();
  await db.menus.put({
    ...menu,
    userId: menu.userId ?? userId,
    updatedAt: menu.updatedAt > 0 ? menu.updatedAt : Date.now(),
    synced: false,
  });
}

export async function deleteMenu(id: string): Promise<void> {
  const existing = await db.menus.get(id);
  if (!existing) return;
  const userId = getCurrentUserId();
  await db.menus.put({
    ...existing,
    userId: existing.userId ?? userId,
    isDeleted: true,
    updatedAt: Date.now(),
    synced: false,
  });
}
