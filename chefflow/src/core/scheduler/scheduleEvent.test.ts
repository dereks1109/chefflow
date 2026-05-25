import { describe, it, expect, beforeEach } from 'vitest';
import { scheduleEvent } from './scheduleEvent';
import { DEMO_EVENT, DEMO_RECIPES, RIBEYE_RECIPE, SALAD_RECIPE } from './__fixtures__/demoEvent';
import type { Dish, KitchenEvent, Recipe } from '../types';

// 18:00 UTC on 2026-05-14 — matches DEMO_EVENT.serveAt
const SERVE_MS = new Date('2026-05-14T18:00:00.000Z').getTime();

describe('scheduleEvent — single-dish baseline', () => {
  it('places the LAST step ending exactly at serveAt and chains earlier steps backwards', () => {
    const event: KitchenEvent = {
      ...DEMO_EVENT,
      dishes: [DEMO_EVENT.dishes[0]],  // just the ribeye
    };
    const result = scheduleEvent({ event, recipes: DEMO_RECIPES });

    expect(result).toHaveLength(RIBEYE_RECIPE.steps.length);
    const last = result[result.length - 1];
    expect(last.endAt).toBe(DEMO_EVENT.serveAt);
    expect(last.recipeStepId).toBe('rs5');  // resting step

    // Verify the chain is contiguous: each step's endAt === next step's startAt.
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].endAt).toBe(result[i].startAt);
    }
  });

  it('falls back to durationSec heuristic when recipe step has no duration', () => {
    const recipe: Recipe = {
      ...RIBEYE_RECIPE,
      steps: RIBEYE_RECIPE.steps.map((s) => ({ ...s, durationSec: undefined })),
    };
    const recipes = new Map([[recipe.id, recipe]]);
    const result = scheduleEvent({
      event: { ...DEMO_EVENT, dishes: [DEMO_EVENT.dishes[0]] },
      recipes,
    });
    // Every step should now carry the "Duration estimated" warning.
    for (const s of result) {
      expect(s.warnings.some((w) => /estimated/i.test(w))).toBe(true);
    }
  });
});

describe('scheduleEvent — multi-dish (Demo Event)', () => {
  let result: ReturnType<typeof scheduleEvent>;

  beforeEach(() => {
    result = scheduleEvent({ event: DEMO_EVENT, recipes: DEMO_RECIPES });
  });

  it('returns one ScheduledStep per recipe step across all dishes', () => {
    const expected = RIBEYE_RECIPE.steps.length + SALAD_RECIPE.steps.length;
    expect(result).toHaveLength(expected);
  });

  it('sorts the merged timeline by startAt ascending', () => {
    for (let i = 1; i < result.length; i++) {
      const a = new Date(result[i - 1].startAt).getTime();
      const b = new Date(result[i].startAt).getTime();
      expect(a).toBeLessThanOrEqual(b);
    }
  });

  it('Ribeye and Salad both finish at the event serveAt (18:00)', () => {
    const ribeyeFinal = result.filter((s) => s.dishLabel === '(Demo) Ribeye').at(-1)!;
    const saladFinal = result.filter((s) => s.dishLabel === '(Demo) Garden Salad').at(-1)!;
    expect(ribeyeFinal.endAt).toBe(DEMO_EVENT.serveAt);
    expect(saladFinal.endAt).toBe(DEMO_EVENT.serveAt);
  });

  it('matches the hand-written timeline: rest starts at 17:55, sear starts at 17:50, salad toss at 17:58', () => {
    const byId = new Map(result.map((s) => [s.recipeStepId, s]));
    const rest = byId.get('rs5')!;        // Ribeye step 5 — rest 300s ending at 18:00
    const sear = byId.get('rs3')!;        // Ribeye step 3 — sear 240s
    const toss = byId.get('ss4')!;        // Salad step 4 — toss 120s ending at 18:00
    const heat = byId.get('rs2')!;        // Ribeye step 2 — heat skillet 120s

    expect(new Date(rest.startAt).getTime()).toBe(SERVE_MS - 300 * 1000); // 17:55:00
    expect(new Date(toss.startAt).getTime()).toBe(SERVE_MS - 120 * 1000); // 17:58:00

    // Ribeye chain backwards: rest(300) + baste(60) + sear(240) → sear starts 600s before serve = 17:50
    expect(new Date(sear.startAt).getTime()).toBe(SERVE_MS - 600 * 1000);
    // heat(120) chains before sear → starts 720s before serve = 17:48
    expect(new Date(heat.startAt).getTime()).toBe(SERVE_MS - 720 * 1000);
  });

  it('records Rule 1 (Timeline Rule) on every scheduled recipe step', () => {
    for (const s of result) {
      if (s.recipeStepId === 'sanitize') continue; // injected, rule 5 only
      expect(s.rulesApplied).toContain(1);
    }
  });
});

describe('scheduleEvent — prepared dishes (no recipe)', () => {
  it('emits a single placeholder step for a dish with isPrepared=true', () => {
    const event: KitchenEvent = {
      ...DEMO_EVENT,
      dishes: [
        { id: 'd_bakery', name: 'Bakery rolls', isPrepared: true, portions: 4, startAt: '2026-05-14T17:50:00.000Z' },
      ],
    };
    const result = scheduleEvent({ event, recipes: new Map() });
    expect(result).toHaveLength(1);
    expect(result[0].text).toMatch(/Bakery rolls/);
    expect(result[0].endAt).toBe(DEMO_EVENT.serveAt);
  });

  it('emits a missing-recipe placeholder when recipeId is set but the recipe isn\'t in the map', () => {
    const event: KitchenEvent = {
      ...DEMO_EVENT,
      dishes: [
        { id: 'd_ghost', name: 'Ghost', recipeId: 'r_does_not_exist', portions: 1, startAt: '2026-05-14T17:30:00.000Z' },
      ],
    };
    const result = scheduleEvent({ event, recipes: new Map() });
    expect(result).toHaveLength(1);
    expect(result[0].warnings[0]).toMatch(/Recipe r_does_not_exist not in input/);
  });
});

describe('scheduleEvent — Rule 5 (allergen isolation)', () => {
  it('injects a sanitize step when an allergen step follows an allergen-free step', () => {
    const allergenRecipe: Recipe = {
      ...SALAD_RECIPE,
      id: 'r_allergen',
      title: 'Peanut sauce',
      steps: [
        { id: 'p1', text: 'Whisk peanut sauce', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen', dependsOn: [], phase: 'prep', durationSec: 120 },
        { id: 'p2', text: 'Stir into noodles', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen', dependsOn: [], phase: 'cook', durationSec: 60 },
      ],
    };
    const event: KitchenEvent = {
      ...DEMO_EVENT,
      dishes: [
        // Salad first (allergen-free), then peanut sauce (allergen) right after.
        { id: 'd_salad', name: 'Salad', recipeId: SALAD_RECIPE.id, portions: 4, startAt: '2026-05-14T17:30:00.000Z' },
        { id: 'd_peanut', name: 'Peanut sauce', recipeId: allergenRecipe.id, portions: 4, startAt: '2026-05-14T17:50:00.000Z' },
      ],
    };
    const recipes = new Map<string, Recipe>([
      [SALAD_RECIPE.id, SALAD_RECIPE],
      [allergenRecipe.id, allergenRecipe],
    ]);
    const result = scheduleEvent({ event, recipes });

    const sanitizeSteps = result.filter((s) => s.recipeStepId === 'sanitize');
    expect(sanitizeSteps.length).toBeGreaterThanOrEqual(1);
    expect(sanitizeSteps[0].rulesApplied).toContain(5);
    expect(sanitizeSteps[0].phase).toBe('sanitize');
    expect(sanitizeSteps[0].durationSec).toBe(300); // default break
  });

  it('does not inject sanitize steps when everything is allergen-free (Demo Event)', () => {
    const result = scheduleEvent({ event: DEMO_EVENT, recipes: DEMO_RECIPES });
    const sanitizeSteps = result.filter((s) => s.recipeStepId === 'sanitize');
    expect(sanitizeSteps).toHaveLength(0);
  });
});

describe('scheduleEvent — fallback anchors', () => {
  it('uses the latest dish.startAt when event.serveAt is undefined', () => {
    const event: KitchenEvent = {
      ...DEMO_EVENT,
      serveAt: undefined,
      dishes: [
        { id: 'd1', name: 'A', recipeId: SALAD_RECIPE.id, portions: 4, startAt: '2026-05-14T16:00:00.000Z' },
        { id: 'd2', name: 'B', recipeId: SALAD_RECIPE.id, portions: 4, startAt: '2026-05-14T19:00:00.000Z' },
      ],
    };
    const result = scheduleEvent({ event, recipes: DEMO_RECIPES });
    const final = result.filter((s) => s.dishLabel === 'A').at(-1)!;
    // Both dishes anchor at the LATEST dish.startAt = 19:00
    expect(final.endAt).toBe('2026-05-14T19:00:00.000Z');
  });
});

describe('scheduleEvent — dependency awareness', () => {
  it('respects intra-recipe dependsOn ordering', () => {
    const recipe: Recipe = {
      ...RIBEYE_RECIPE,
      steps: [
        { id: 'a', text: 'A', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: ['b'], phase: 'cook', durationSec: 60 },
        { id: 'b', text: 'B', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'cook', durationSec: 60 },
        { id: 'c', text: 'C', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: ['a'], phase: 'cook', durationSec: 60 },
      ],
    };
    const recipes = new Map([[recipe.id, recipe]]);
    const dish: Dish = { id: 'd_dep', name: 'Dep', recipeId: recipe.id, portions: 1, startAt: '2026-05-14T17:00:00.000Z' };
    const event: KitchenEvent = { ...DEMO_EVENT, dishes: [dish] };
    const result = scheduleEvent({ event, recipes });

    // Topological order: b before a before c. Final = c, ending at serveAt.
    expect(result.map((s) => s.recipeStepId)).toEqual(['b', 'a', 'c']);
  });
});

describe('scheduleEvent — portion scaling', () => {
  it('stretches active step durations when dish portions exceed recipe originalYield', () => {
    // Ribeye recipe authored for 2 portions; ask the scheduler to plan 20.
    // Each active step's durationSec should be ~10× longer; passive steps
    // (kind: passive) stay unchanged.
    const recipes = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE]]);

    const small: Dish = { id: 'd_small', name: 'Ribeye small', recipeId: RIBEYE_RECIPE.id, portions: 2, startAt: '2026-05-14T17:00:00.000Z' };
    const large: Dish = { id: 'd_large', name: 'Ribeye large', recipeId: RIBEYE_RECIPE.id, portions: 20, startAt: '2026-05-14T17:00:00.000Z' };

    const smallResult = scheduleEvent({ event: { ...DEMO_EVENT, dishes: [small] }, recipes });
    const largeResult = scheduleEvent({ event: { ...DEMO_EVENT, dishes: [large] }, recipes });

    const smallTotal = smallResult.reduce((sum, s) => sum + s.durationSec, 0);
    const largeTotal = largeResult.reduce((sum, s) => sum + s.durationSec, 0);
    // 10× scaling on active steps, passive ('rest') stays put → between 5× and 10×.
    expect(largeTotal).toBeGreaterThan(smallTotal * 5);

    // Both end at serveAt — but the LARGE one starts earlier.
    const smallStart = new Date(smallResult[0].startAt).getTime();
    const largeStart = new Date(largeResult[0].startAt).getTime();
    expect(largeStart).toBeLessThan(smallStart);
  });
});

describe('scheduleEvent — sub-recipe expansion', () => {
  it("merges a referenced sub-recipe's steps before the parent's steps", () => {
    const sauce: Recipe = {
      id: 'r_sauce',
      title: 'Pepper Sauce',
      originalYield: 4,
      ingredients: [],
      steps: [
        { id: 'sauce1', text: 'Sweat shallot', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'prep', durationSec: 120 },
        { id: 'sauce2', text: 'Reduce', kind: 'passive', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: ['sauce1'], phase: 'cook', durationSec: 300 },
      ],
      createdAt: 0,
      updatedAt: 0,
    };
    const parent: Recipe = {
      id: 'r_steak',
      title: 'Steak',
      originalYield: 2,
      ingredients: [
        { id: 'ing_sauce', raw: '{80|ml|Pepper Sauce}', amount: 80, unit: 'ml', name: 'Pepper Sauce', isLocked: false, componentRecipeId: 'r_sauce' },
      ],
      steps: [
        { id: 'sear', text: 'Sear steak', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'cook', durationSec: 180 },
      ],
      createdAt: 0,
      updatedAt: 0,
    };
    const recipes = new Map<string, Recipe>([
      ['r_steak', parent],
      ['r_sauce', sauce],
    ]);
    const dish: Dish = { id: 'd_steak', name: 'Steak', recipeId: 'r_steak', portions: 1, startAt: '2026-05-14T17:00:00.000Z' };
    const event: KitchenEvent = { ...DEMO_EVENT, dishes: [dish] };
    const result = scheduleEvent({ event, recipes });

    // Two sauce steps + one parent step.
    expect(result).toHaveLength(3);
    const ids = result.map((s) => s.recipeStepId);
    expect(ids).toContain('r_sauce::sauce1');
    expect(ids).toContain('r_sauce::sauce2');
    expect(ids).toContain('sear');
    // Sub-recipe internal dep is preserved: sauce1 starts before sauce2.
    const sauce1Idx = ids.indexOf('r_sauce::sauce1');
    const sauce2Idx = ids.indexOf('r_sauce::sauce2');
    expect(sauce1Idx).toBeLessThan(sauce2Idx);
    // The final step ends at serveAt (steps reverse-anchor to deadline).
    expect(result[result.length - 1].endAt).toBe(DEMO_EVENT.serveAt);
    // dependsOnStepIds round-trip with the dish-prefix that scheduleDish adds.
    const sauce2Step = result.find((s) => s.recipeStepId === 'r_sauce::sauce2')!;
    expect(sauce2Step.dependsOnStepIds).toEqual(['d_steak:r_sauce::sauce1']);
  });
});
