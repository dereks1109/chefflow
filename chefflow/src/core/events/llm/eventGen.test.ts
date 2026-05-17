import { describe, it, expect } from 'vitest';
import { parseLlmEvent, EventGenError } from './eventGen';

describe('parseLlmEvent', () => {
  it('parses a complete event', () => {
    const raw = JSON.stringify({
      title: 'Sunday dinner',
      serveAt: '2026-06-12T19:30:00',
      location: '12 Greenfield Rd, London',
      notes: '6 guests, 2 vegans, 1 peanut allergy',
      dishes: [
        { name: 'Beef Bourguignon', portions: 4, startAt: '2026-06-12T19:30:00' },
        { name: 'Roast Vegetable Plate', portions: 2 },
      ],
    });
    const got = parseLlmEvent(raw);
    expect(got.title).toBe('Sunday dinner');
    expect(got.serveAt).toBe('2026-06-12T19:30:00');
    expect(got.location).toBe('12 Greenfield Rd, London');
    expect(got.notes).toBe('6 guests, 2 vegans, 1 peanut allergy');
    expect(got.dishes).toHaveLength(2);
    expect(got.dishes[0].name).toBe('Beef Bourguignon');
    expect(got.dishes[0].portions).toBe(4);
    // Second dish gets event serveAt fallback.
    expect(got.dishes[1].startAt).toBe('2026-06-12T19:30:00');
    expect(typeof got.id).toBe('string');
  });

  it('defaults missing title to "Untitled event"', () => {
    const got = parseLlmEvent(JSON.stringify({ dishes: [] }));
    expect(got.title).toBe('Untitled event');
  });

  it('omits empty location and serveAt', () => {
    const got = parseLlmEvent(JSON.stringify({ title: 'X', location: '   ', serveAt: '', dishes: [] }));
    expect(got.location).toBeUndefined();
    expect(got.serveAt).toBeUndefined();
  });

  it('strips markdown fences', () => {
    const raw = '```json\n{"title":"Picnic","dishes":[]}\n```';
    expect(parseLlmEvent(raw).title).toBe('Picnic');
  });

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Here is the event: {"title":"Lunch","dishes":[]} done.';
    expect(parseLlmEvent(raw).title).toBe('Lunch');
  });

  it('drops malformed dishes (no name, wrong shape)', () => {
    const raw = JSON.stringify({
      title: 'X',
      dishes: [
        { name: 'Good', portions: 2 },
        { name: '  ' },
        'not-an-object',
        { portions: 5 },
      ],
    });
    const got = parseLlmEvent(raw);
    expect(got.dishes).toHaveLength(1);
    expect(got.dishes[0].name).toBe('Good');
  });

  it('defaults invalid portions to 4', () => {
    const raw = JSON.stringify({
      title: 'X',
      dishes: [
        { name: 'A', portions: -1 },
        { name: 'B', portions: 'lots' },
        { name: 'C' },
      ],
    });
    const got = parseLlmEvent(raw);
    expect(got.dishes.map((d) => d.portions)).toEqual([4, 4, 4]);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseLlmEvent('definitely not json')).toThrow(EventGenError);
  });
});
