import Dexie, { type Table } from 'dexie';
import type { Recipe } from '../core/types';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;

  constructor() {
    super('chefflow');
    this.version(1).stores({
      recipes: 'id, updatedAt, title',
    });
  }
}

export const db = new ChefFlowDB();
