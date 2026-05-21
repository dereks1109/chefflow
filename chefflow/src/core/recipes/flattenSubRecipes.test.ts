import { describe, it, expect, vi } from 'vitest';
import { flattenSubRecipes } from './flattenSubRecipes';
import type { Recipe, Ingredient, WorkflowStep } from '../types';

function ing(name: string, componentRecipeId?: string): Ingredient {
  return {
    id: `ing_${name}`,
    raw: `{0|g|${name}}`,
    amount: 0,
    unit: 'g',
    name,
    isLocked: false,
    ...(componentRecipeId ? { componentRecipeId } : {}),
  };
}

function step(id: string, dependsOn: string[] = []): WorkflowStep {
  return {
    id,
    text: `step ${id}`,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn,
    phase: 'prep',
  };
}

function recipe(id: string, ingredients: Ingredient[], steps: WorkflowStep[]): Recipe {
  return {
    id,
    title: `Recipe ${id}`,
    originalYield: 1,
    ingredients,
    steps,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('flattenSubRecipes', () => {
  it('returns the recipe unchanged when no ingredient has componentRecipeId', () => {
    const r = recipe('parent', [ing('salt')], [step('s1')]);
    const out = flattenSubRecipes(r, new Map([['parent', r]]));
    expect(out.steps).toEqual([step('s1')]);
  });

  it('prepends sub-recipe steps with namespaced IDs before the parent steps', () => {
    const sub = recipe('sub', [ing('shallot')], [step('a'), step('b', ['a'])]);
    const parent = recipe('parent', [ing('sauce', 'sub'), ing('steak')], [step('sear')]);
    const out = flattenSubRecipes(parent, new Map([['parent', parent], ['sub', sub]]));
    expect(out.steps.map((s) => s.id)).toEqual(['sub::a', 'sub::b', 'sear']);
    // dependsOn inside the sub is remapped so 'sub::b' depends on 'sub::a'.
    expect(out.steps[1].dependsOn).toEqual(['sub::a']);
    // sourceRecipeId is set on merged steps but not on parent's own.
    expect(out.steps[0].sourceRecipeId).toBe('sub');
    expect(out.steps[2].sourceRecipeId).toBeUndefined();
  });

  it('recursively expands sub-recipes of sub-recipes (sub-of-sub steps first)', () => {
    const subSub = recipe('subsub', [], [step('x')]);
    const sub = recipe('sub', [ing('component', 'subsub')], [step('y')]);
    const parent = recipe('parent', [ing('sauce', 'sub')], [step('z')]);
    const out = flattenSubRecipes(parent, new Map([
      ['parent', parent], ['sub', sub], ['subsub', subSub],
    ]));
    expect(out.steps.map((s) => s.id)).toEqual(['subsub::x', 'sub::y', 'z']);
  });

  it('detects cycles and stops without infinite recursion', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // a -> b -> a cycle.
    const a = recipe('a', [ing('refToB', 'b')], [step('a1')]);
    const b = recipe('b', [ing('refToA', 'a')], [step('b1')]);
    const out = flattenSubRecipes(a, new Map([['a', a], ['b', b]]));
    expect(out.steps.map((s) => s.id)).toEqual(['b::b1', 'a1']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cycle detected'));
    warnSpy.mockRestore();
  });

  it('honors maxDepth and skips deeper expansions silently', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // chain: parent -> s1 -> s2 -> s3
    const s3 = recipe('s3', [], [step('z')]);
    const s2 = recipe('s2', [ing('refS3', 's3')], [step('y')]);
    const s1 = recipe('s1', [ing('refS2', 's2')], [step('x')]);
    const parent = recipe('parent', [ing('refS1', 's1')], [step('top')]);
    const recipesById = new Map([
      ['parent', parent], ['s1', s1], ['s2', s2], ['s3', s3],
    ]);
    const out = flattenSubRecipes(parent, recipesById, { maxDepth: 2 });
    // depth 0 = parent. s1 (depth 1) expands. s2 (depth 2) expands. s3 (depth 3) hits cap.
    expect(out.steps.map((s) => s.id)).toEqual(['s2::y', 's1::x', 'top']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('max depth'));
    warnSpy.mockRestore();
  });

  it('skips an ingredient whose referenced recipe is missing from the map', () => {
    const parent = recipe('parent', [ing('orphan', 'ghost')], [step('a')]);
    const out = flattenSubRecipes(parent, new Map([['parent', parent]]));
    expect(out.steps.map((s) => s.id)).toEqual(['a']);
  });
});
