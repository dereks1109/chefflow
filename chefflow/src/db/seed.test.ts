import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { seedDemoRecipes, seedDemoEvents } from './seed';

beforeEach(async () => {
  await db.recipes.clear();
  await db.events.clear();
  window.localStorage.clear();
});

describe('per-user demo seeding', () => {
  it('seeds three recipes + one event scoped to the user', async () => {
    await seedDemoRecipes('userA');
    await seedDemoEvents('userA');

    const recipes = await db.recipes.where('ownerId').equals('userA').toArray();
    expect(recipes).toHaveLength(3);
    expect(recipes.every((r) => r.ownerId === 'userA')).toBe(true);
    expect(recipes.every((r) => r.dirty === true)).toBe(true);

    const events = await db.events.where('ownerId').equals('userA').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].ownerId).toBe('userA');
    // Demo event references demo recipes by per-user id so the link survives.
    expect(events[0].dishes[0].recipeId).toMatch(/__userA$/);
  });

  it('is idempotent — seeding twice does not duplicate rows', async () => {
    await seedDemoRecipes('userA');
    await seedDemoRecipes('userA');
    await seedDemoEvents('userA');
    await seedDemoEvents('userA');
    const recipes = await db.recipes.where('ownerId').equals('userA').count();
    const events = await db.events.where('ownerId').equals('userA').count();
    expect(recipes).toBe(3);
    expect(events).toBe(1);
  });

  it('gives every user a fully independent copy on the same browser', async () => {
    await seedDemoRecipes('userA');
    await seedDemoEvents('userA');
    await seedDemoRecipes('userB');
    await seedDemoEvents('userB');

    const aRecipes = await db.recipes.where('ownerId').equals('userA').toArray();
    const bRecipes = await db.recipes.where('ownerId').equals('userB').toArray();
    expect(aRecipes).toHaveLength(3);
    expect(bRecipes).toHaveLength(3);
    // IDs are distinct so the two users don't collide on primary key.
    const aIds = aRecipes.map((r) => r.id).sort();
    const bIds = bRecipes.map((r) => r.id).sort();
    expect(aIds.some((id) => bIds.includes(id))).toBe(false);

    const aEvents = await db.events.where('ownerId').equals('userA').toArray();
    const bEvents = await db.events.where('ownerId').equals('userB').toArray();
    expect(aEvents[0].id).not.toBe(bEvents[0].id);
    // userB's demo event references userB's demo recipes, not userA's.
    expect(aEvents[0].dishes[0].recipeId).toMatch(/__userA$/);
    expect(bEvents[0].dishes[0].recipeId).toMatch(/__userB$/);
  });

  it('user A edits do not leak into user B demos', async () => {
    await seedDemoRecipes('userA');
    const ribeye = await db.recipes.get(`r_demo_ribeye__userA`);
    expect(ribeye).toBeDefined();
    await db.recipes.put({ ...ribeye!, title: 'A custom title' });

    await seedDemoRecipes('userB');
    const bRibeye = await db.recipes.get(`r_demo_ribeye__userB`);
    expect(bRibeye?.title).toBe('(Demo) Ribeye');
  });
});
