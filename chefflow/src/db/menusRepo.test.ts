import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listMenus, getMenu, saveMenu, deleteMenu } from './menusRepo';
import type { Menu } from '../core/types';

function makeMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    id: 'm_test_001',
    title: 'Test Menu',
    recipeIds: ['r_test_001'],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.menus.clear();
});

describe('menusRepo', () => {
  it('saves and retrieves a menu', async () => {
    await saveMenu(makeMenu({ description: 'chef note' }));
    const got = await getMenu('m_test_001');
    expect(got?.title).toBe('Test Menu');
    expect(got?.description).toBe('chef note');
    expect(got?.recipeIds).toEqual(['r_test_001']);
  });

  it('listMenus returns all saved menus sorted by updatedAt desc', async () => {
    await saveMenu(makeMenu({ id: 'a', title: 'A', updatedAt: 100 }));
    await saveMenu(makeMenu({ id: 'b', title: 'B', updatedAt: 300 }));
    await saveMenu(makeMenu({ id: 'c', title: 'C', updatedAt: 200 }));
    const all = await listMenus();
    expect(all.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('saveMenu updates an existing record', async () => {
    await saveMenu(makeMenu({ title: 'V1' }));
    await saveMenu(makeMenu({ title: 'V2' }));
    const all = await listMenus();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteMenu removes the record', async () => {
    await saveMenu(makeMenu());
    await deleteMenu('m_test_001');
    expect(await getMenu('m_test_001')).toBeUndefined();
  });
});
