import Dexie, { type Table } from 'dexie';
import type { Recipe, KitchenEvent } from '../core/types';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;
  events!: Table<KitchenEvent, string>;

  constructor() {
    super('chefflow');
    this.version(1).stores({
      recipes: 'id, updatedAt, title',
    });
    this.version(2).stores({
      recipes: 'id, updatedAt, title',
      events: 'id, updatedAt, title, serveAt',
    });
  }
}

export const db = new ChefFlowDB();
