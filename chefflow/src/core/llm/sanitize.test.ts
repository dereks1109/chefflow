import { describe, it, expect } from 'vitest';
import { stripEventPii, summarizeDietary } from './sanitize';
import type { KitchenEvent } from '../types';

const PII_EVENT: KitchenEvent = {
  id: 'evt_1',
  title: 'Anniversary Dinner',
  serveAt: '2026-05-24T19:00:00.000Z',
  location: '12 Acacia Ave, Hove BN3 6XR',
  budget: 250,
  contactName: 'Jane Smith',
  contactEmail: 'jane@example.com',
  contactPhone: '+44 7700 900123',
  notes: 'Jane is vegan; her partner is gluten-free.',
  dishes: [
    {
      id: 'd1',
      name: 'Beetroot tartare',
      portions: 2,
      startAt: '2026-05-24T18:30:00.000Z',
      notes: 'serve cold',
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('stripEventPii', () => {
  it('removes contact name, email, phone, location, budget, and event notes', () => {
    const safe = stripEventPii(PII_EVENT);
    expect(safe).not.toHaveProperty('contactName');
    expect(safe).not.toHaveProperty('contactEmail');
    expect(safe).not.toHaveProperty('contactPhone');
    expect(safe).not.toHaveProperty('location');
    expect(safe).not.toHaveProperty('budget');
    expect(safe).not.toHaveProperty('notes');
  });

  it('keeps fields the LLM actually needs', () => {
    const safe = stripEventPii(PII_EVENT);
    expect(safe.id).toBe('evt_1');
    expect(safe.title).toBe('Anniversary Dinner');
    expect(safe.serveAt).toBe('2026-05-24T19:00:00.000Z');
    expect(safe.dishes).toHaveLength(1);
    expect(safe.dishes[0].name).toBe('Beetroot tartare');
  });

  it('preserves dish-level notes (these describe the cooking task, not the guest)', () => {
    const safe = stripEventPii(PII_EVENT);
    expect(safe.dishes[0].notes).toBe('serve cold');
  });

  it('survives a JSON round-trip without leaking stripped fields', () => {
    const safe = stripEventPii(PII_EVENT);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('+44 7700 900123');
    expect(serialized).not.toContain('Acacia Ave');
    expect(serialized).not.toContain('Jane Smith');
  });
});

describe('summarizeDietary', () => {
  it('returns [] for empty / missing input', () => {
    expect(summarizeDietary(undefined)).toEqual([]);
    expect(summarizeDietary(null)).toEqual([]);
    expect(summarizeDietary('')).toEqual([]);
  });

  it('extracts dietary tags from freeform text', () => {
    expect(summarizeDietary('Jane is vegan; her partner is gluten-free.')).toEqual([
      'gluten-free',
      'vegan',
    ]);
  });

  it('dedupes repeated mentions', () => {
    expect(summarizeDietary('vegan vegan vegan')).toEqual(['vegan']);
  });

  it('drops names and other identifying text — only categories survive', () => {
    const result = summarizeDietary('Tom Stephens has a severe peanut allergy.');
    expect(result).toEqual(['nut-free']);
    expect(result.join(',')).not.toContain('Tom');
    expect(result.join(',')).not.toContain('Stephens');
  });

  it('handles common variant spellings', () => {
    expect(summarizeDietary('dairy free + lactose-free')).toEqual(['dairy-free']);
    expect(summarizeDietary('gluten-free, gluten free')).toEqual(['gluten-free']);
    expect(summarizeDietary('halal preferred, kosher acceptable')).toEqual(['halal', 'kosher']);
  });
});
