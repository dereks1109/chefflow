import { db } from './dexie';
import type { Menu } from '../core/types';

export async function listMenus(): Promise<Menu[]> {
  return db.menus.orderBy('updatedAt').reverse().toArray();
}

export async function getMenu(id: string): Promise<Menu | undefined> {
  return db.menus.get(id);
}

export async function saveMenu(menu: Menu): Promise<void> {
  await db.menus.put(menu);
}

export async function deleteMenu(id: string): Promise<void> {
  await db.menus.delete(id);
}
