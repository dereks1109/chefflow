import Dexie, { type Table } from 'dexie';
import type { Recipe, KitchenEvent, Menu } from '../core/types';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;
  events!: Table<KitchenEvent, string>;
  menus!: Table<Menu, string>;

  constructor() {
    super('chefflow');
    this.version(1).stores({
      recipes: 'id, updatedAt, title',
    });
    this.version(2).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
    });
    // v3: events.sessions[] removed, replaced by events.dishes[]. Migrate
    // any in-flight rows so we don't lose data created during the brief
    // window when sessions were the model.
    this.version(3).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
    }).upgrade((tx) =>
      tx.table('events').toCollection().modify((event: Record<string, unknown>) => {
        const oldSessions = event.sessions as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(oldSessions) && !event.dishes) {
          event.dishes = oldSessions.map((s) => ({
            id: s.id,
            name: s.title ?? '',
            portions: 1,
            startAt: s.startAt ?? new Date().toISOString(),
            notes: s.notes || undefined,
          }));
        }
        if (!event.dishes) event.dishes = [];
        delete event.sessions;
      })
    );
    // v4: menus table — named collections of recipeIds. Standalone from
    // events; no migration needed since this is a brand-new store.
    this.version(4).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
      menus: 'id, updatedAt, title',
    });
  }
}

export const db = new ChefFlowDB();
