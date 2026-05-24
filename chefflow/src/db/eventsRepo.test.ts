import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listEvents, getEvent, saveEvent, deleteEvent } from './eventsRepo';
import { setCurrentUserId } from '../state/currentUser';
import type { KitchenEvent } from '../core/types';

const TEST_USER = 'user_test_001';

function makeEvent(overrides: Partial<KitchenEvent> = {}): KitchenEvent {
  return {
    id: 'e_test_001',
    title: 'Test Event',
    serveAt: '2026-06-15T18:00:00.000Z',
    notes: '',
    dishes: [],
    createdAt: 1000,
    updatedAt: 1000,
    ownerId: TEST_USER,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.events.clear();
  setCurrentUserId(TEST_USER);
});

describe('eventsRepo', () => {
  it('saves and retrieves an event', async () => {
    await saveEvent(makeEvent());
    const got = await getEvent('e_test_001');
    expect(got?.title).toBe('Test Event');
    expect(got?.dishes).toEqual([]);
    expect(got?.ownerId).toBe(TEST_USER);
    expect(got?.dirty).toBe(true);
  });

  it('returns undefined for unknown id', async () => {
    expect(await getEvent('nope')).toBeUndefined();
  });

  it('listEvents returns scheduled events chronologically (upcoming first)', async () => {
    await saveEvent(makeEvent({ id: 'a', title: 'A', serveAt: '2026-08-01T12:00:00.000Z' }));
    await saveEvent(makeEvent({ id: 'b', title: 'B', serveAt: '2026-06-15T12:00:00.000Z' }));
    await saveEvent(makeEvent({ id: 'c', title: 'C', serveAt: '2026-07-01T12:00:00.000Z' }));
    const all = await listEvents();
    expect(all.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('listEvents puts unscheduled events after scheduled ones', async () => {
    await saveEvent(makeEvent({ id: 'sched', serveAt: '2026-06-15T12:00:00.000Z' }));
    await new Promise((r) => setTimeout(r, 2));
    await saveEvent(makeEvent({ id: 'unscheduled2', serveAt: undefined }));
    await new Promise((r) => setTimeout(r, 2));
    await saveEvent(makeEvent({ id: 'unscheduled1', serveAt: undefined }));
    const all = await listEvents();
    expect(all.map((e) => e.id)).toEqual(['sched', 'unscheduled1', 'unscheduled2']);
  });

  it('saveEvent updates an existing record', async () => {
    await saveEvent(makeEvent({ title: 'V1' }));
    await saveEvent(makeEvent({ title: 'V2' }));
    const all = await listEvents();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteEvent soft-deletes the record (filtered from listing/get)', async () => {
    await saveEvent(makeEvent());
    await deleteEvent('e_test_001');
    expect(await getEvent('e_test_001')).toBeUndefined();
    expect(await listEvents()).toEqual([]);
    const raw = await db.events.get('e_test_001');
    expect(raw?.deletedAt).toBeGreaterThan(0);
    expect(raw?.dirty).toBe(true);
  });

  it('round-trips dishes including a recipe link and a "prepared" flag', async () => {
    await saveEvent(makeEvent({
      dishes: [
        { id: 'd1', name: 'Ribeye', recipeId: 'r_demo_ribeye', portions: 2, startAt: '2026-06-15T17:30:00.000Z' },
        { id: 'd2', name: 'Bakery rolls', isPrepared: true, portions: 8, startAt: '2026-06-15T18:00:00.000Z', notes: 'pick up at 5' },
      ],
    }));
    const got = await getEvent('e_test_001');
    expect(got?.dishes).toHaveLength(2);
    expect(got?.dishes[0]).toMatchObject({ name: 'Ribeye', recipeId: 'r_demo_ribeye', portions: 2 });
    expect(got?.dishes[1]).toMatchObject({ name: 'Bakery rolls', isPrepared: true, notes: 'pick up at 5' });
  });

  it('isolates by ownerId — userA cannot see userB events', async () => {
    setCurrentUserId('userA');
    await saveEvent(makeEvent({ id: 'ea', ownerId: 'userA' }));
    setCurrentUserId('userB');
    await saveEvent(makeEvent({ id: 'eb', ownerId: 'userB' }));

    setCurrentUserId('userA');
    const aList = await listEvents();
    expect(aList.map((e) => e.id)).toEqual(['ea']);
    expect(await getEvent('eb')).toBeUndefined();

    setCurrentUserId('userB');
    const bList = await listEvents();
    expect(bList.map((e) => e.id)).toEqual(['eb']);
  });
});
