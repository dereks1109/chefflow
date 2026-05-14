import { describe, it, expect } from 'vitest';
import { hashDishes } from './hash';
import type { Dish } from '../types';

function dish(overrides: Partial<Dish> = {}): Dish {
  return {
    id: 'd1',
    name: 'Ribeye',
    recipeId: 'r1',
    portions: 2,
    startAt: '2026-05-14T17:30:00.000Z',
    ...overrides,
  };
}

describe('hashDishes', () => {
  it('returns the same string for identical inputs', () => {
    expect(hashDishes([dish()])).toBe(hashDishes([dish()]));
  });

  it('differs when a dish is added', () => {
    expect(hashDishes([dish()])).not.toBe(hashDishes([dish(), dish({ id: 'd2' })]));
  });

  it('differs when a dish field changes (portions)', () => {
    expect(hashDishes([dish({ portions: 2 })])).not.toBe(hashDishes([dish({ portions: 4 })]));
  });

  it('differs when a dish field changes (startAt)', () => {
    expect(hashDishes([dish()])).not.toBe(hashDishes([dish({ startAt: '2026-05-14T18:00:00.000Z' })]));
  });

  it('differs when dishes are reordered', () => {
    const a = dish({ id: 'd1' });
    const b = dish({ id: 'd2' });
    expect(hashDishes([a, b])).not.toBe(hashDishes([b, a]));
  });

  it('treats empty-string notes the same as undefined notes', () => {
    expect(hashDishes([dish({ notes: undefined })])).toBe(hashDishes([dish({ notes: '' })]));
  });

  it('handles the empty list', () => {
    expect(hashDishes([])).toBe('');
  });
});
