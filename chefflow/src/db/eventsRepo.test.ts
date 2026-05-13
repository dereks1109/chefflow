import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listEvents, getEvent, saveEvent, deleteEvent } from './eventsRepo';
import type { KitchenEvent } from '../core/types';

function makeEvent(overrides: Partial<KitchenEvent> = {}): KitchenEvent {
  return {
    id: 'e_test_001',
    title: 'Test Event',
    serveAt: '2026-06-15T18:00:00.000Z',
    notes: '',
    sessions: [],
    dishes: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.events.clear();
});

describe('eventsRepo', () => {
  it('saves and retrieves an event', async () => {
    await saveEvent(makeEvent());
    const got = await getEvent('e_test_001');
    expect(got?.title).toBe('Test Event');
    expect(got?.sessions).toEqual([]);
  });

  it('returns undefined for unknown id', async () => {
    expect(await getEvent('nope')).toBeUndefined();
  });

  it('listEvents returns scheduled events chronologically (upcoming first)', async () => {
    await saveEvent(makeEvent({ id: 'a', title: 'A', serveAt: '2026-08-01T12:00:00.000Z' }));
    await saveEvent(makeEvent({ id: 'b', title: 'B', serveAt: '2026-06-15T12:00:00.000Z' }));
    await saveEvent(makeEvent({ id: 'c', title: 'C', serveAt: '2026-07-01T12:00:00.000Z' }));
    const all = await listEvents();
    expect(all.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('listEvents puts unscheduled events after scheduled ones', async () => {
    await saveEvent(makeEvent({ id: 'sched', serveAt: '2026-06-15T12:00:00.000Z', updatedAt: 1 }));
    await saveEvent(makeEvent({ id: 'unscheduled1', serveAt: undefined, updatedAt: 100 }));
    await saveEvent(makeEvent({ id: 'unscheduled2', serveAt: undefined, updatedAt: 50 }));
    const all = await listEvents();
    expect(all.map(e => e.id)).toEqual(['sched', 'unscheduled1', 'unscheduled2']);
  });

  it('saveEvent updates an existing record', async () => {
    await saveEvent(makeEvent({ title: 'V1' }));
    await saveEvent(makeEvent({ title: 'V2' }));
    const all = await listEvents();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteEvent removes the record', async () => {
    await saveEvent(makeEvent());
    await deleteEvent('e_test_001');
    expect(await getEvent('e_test_001')).toBeUndefined();
  });

  it('round-trips sessions', async () => {
    await saveEvent(makeEvent({
      sessions: [
        { id: 's1', title: 'Prep', startAt: '2026-06-15T14:00:00.000Z', endAt: '2026-06-15T15:30:00.000Z', notes: 'Chop veg' },
      ],
    }));
    const got = await getEvent('e_test_001');
    expect(got?.sessions).toHaveLength(1);
    expect(got?.sessions[0].title).toBe('Prep');
  });
});
