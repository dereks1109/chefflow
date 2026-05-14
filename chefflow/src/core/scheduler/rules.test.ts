import { describe, it, expect } from 'vitest';
import { isFlash, isStable, isAllergen, isAllergenFree, sameBatchKey, topologicalSort } from './rules';
import type { WorkflowStep } from '../types';

function step(id: string, overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id,
    text: id,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: 'cook',
    ...overrides,
  };
}

describe('thermal / allergen predicates', () => {
  it('classifies thermal classes', () => {
    expect(isFlash(step('a', { thermalClass: 'flash' }))).toBe(true);
    expect(isFlash(step('b'))).toBe(false);
    expect(isStable(step('a', { thermalClass: 'stable' }))).toBe(true);
    expect(isStable(step('b'))).toBe(false);
  });
  it('classifies allergens', () => {
    expect(isAllergen(step('a', { allergenClass: 'allergen' }))).toBe(true);
    expect(isAllergen(step('b'))).toBe(false);
    expect(isAllergenFree(step('b'))).toBe(true);
  });
});

describe('sameBatchKey', () => {
  it('only matches when both have the same non-empty key', () => {
    expect(sameBatchKey(step('a', { batchKey: 'chop:onion' }), step('b', { batchKey: 'chop:onion' }))).toBe(true);
    expect(sameBatchKey(step('a', { batchKey: 'chop:onion' }), step('b', { batchKey: 'chop:garlic' }))).toBe(false);
    expect(sameBatchKey(step('a'), step('b'))).toBe(false); // both unset
  });
});

describe('topologicalSort', () => {
  it('preserves input order when there are no dependencies', () => {
    const a = step('a'), b = step('b'), c = step('c');
    const { sorted, cycleNodeIds } = topologicalSort([a, b, c]);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(cycleNodeIds).toEqual([]);
  });

  it('moves dependents after their prerequisites', () => {
    const a = step('a', { dependsOn: ['c'] });
    const b = step('b');
    const c = step('c');
    const { sorted } = topologicalSort([a, b, c]);
    // a depends on c — must come after c. b is independent, stays in input order.
    const idx = (id: string) => sorted.findIndex((s) => s.id === id);
    expect(idx('c')).toBeLessThan(idx('a'));
    expect(idx('b')).toBeLessThan(idx('a')); // b had no dep; ready immediately
  });

  it('flags cycles and still returns every node', () => {
    const a = step('a', { dependsOn: ['b'] });
    const b = step('b', { dependsOn: ['a'] });
    const { sorted, cycleNodeIds } = topologicalSort([a, b]);
    expect(cycleNodeIds.sort()).toEqual(['a', 'b']);
    expect(sorted.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores dangling dependencies (ids that aren\'t in the input)', () => {
    const a = step('a', { dependsOn: ['ghost'] });
    const { sorted, cycleNodeIds } = topologicalSort([a]);
    expect(sorted.map((s) => s.id)).toEqual(['a']);
    expect(cycleNodeIds).toEqual([]);
  });
});
