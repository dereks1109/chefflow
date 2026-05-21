import { describe, it, expect } from 'vitest';
import { aggregateIngredients } from './aggregateIngredients';
import type { Dish, Ingredient, KitchenEvent, Recipe } from '../types';

// ---------------------------------------------------------------------------
// Test helpers — tiny factories so each spec stays readable.
// ---------------------------------------------------------------------------
function ing(name: string, amount: number, unit: string, opts: Partial<Ingredient> = {}): Ingredient {
  return {
    id: `i_${name}_${unit}_${Math.random().toString(36).slice(2, 6)}`,
    raw: `{${amount}|${unit}|${name}}`,
    amount,
    unit,
    name,
    isLocked: false,
    ...opts,
  };
}

function recipe(id: string, title: string, originalYield: number, ingredients: Ingredient[]): Recipe {
  return {
    id,
    title,
    originalYield,
    ingredients,
    steps: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function dish(id: string, name: string, recipeId: string, portions: number): Dish {
  return {
    id,
    name,
    recipeId,
    portions,
    startAt: '2026-05-14T17:00:00.000Z',
  };
}

function evt(dishes: Dish[]): KitchenEvent {
  return {
    id: 'e_test',
    title: 'Test',
    notes: '',
    dishes,
    createdAt: 0,
    updatedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests — each name encodes WHY the behaviour matters (Rule 9).
// ---------------------------------------------------------------------------
describe('aggregateIngredients', () => {
  it('merges identical ingredients across dishes — chefs shop once per name, not per recipe', () => {
    // Choose amounts that cross the 1000 g threshold so we exercise g → kg
    // auto-normalisation, AND land on a chef-friendly 0.25 kg step so the
    // existing roundSensible() utility (shared with the scaler) doesn't
    // alter the expected value. 500 + 1000 = 1500 g → 1.5 kg.
    const salad = recipe('r_salad', 'Salad', 4, [ing('Tomato', 500, 'g')]);
    const soup = recipe('r_soup', 'Soup', 4, [ing('Tomato', 1, 'kg')]);
    const event = evt([
      dish('d1', 'Salad', 'r_salad', 4),
      dish('d2', 'Soup', 'r_soup', 4),
    ]);
    const recipes = new Map([[salad.id, salad], [soup.id, soup]]);

    const { lines } = aggregateIngredients({ event, recipes });

    const tomato = lines.find((l) => l.name === 'Tomato');
    expect(tomato).toBeDefined();
    expect(tomato!.dishNames).toEqual(['Salad', 'Soup']);
    expect(tomato!.amount).toBe(1.5); // 500 g + 1 kg → 1.5 kg
    expect(tomato!.unit).toBe('kg');
  });

  it('normalises across weight units within a family — g + kg combine via convertUnit, not parallel buckets', () => {
    const a = recipe('r_a', 'A', 1, [ing('Onion', 500, 'g')]);
    const b = recipe('r_b', 'B', 1, [ing('Onion', 1, 'kg')]);
    const event = evt([dish('d_a', 'A', 'r_a', 1), dish('d_b', 'B', 'r_b', 1)]);
    const recipes = new Map([[a.id, a], [b.id, b]]);

    const { lines } = aggregateIngredients({ event, recipes });
    const onion = lines.find((l) => l.name === 'Onion')!;
    expect(onion.amount).toBe(1.5); // 0.5 kg + 1 kg = 1.5 kg
    expect(onion.unit).toBe('kg');
    expect(onion.dishNames).toHaveLength(2);
  });

  it('scales each ingredient by dish.portions / recipe.originalYield — 2-portion recipe used for 20 means 10x', () => {
    const ribeye = recipe('r_ribeye', 'Ribeye', 2, [ing('Butter', 30, 'g')]);
    const event = evt([dish('d1', 'Ribeye', 'r_ribeye', 20)]);
    const recipes = new Map([[ribeye.id, ribeye]]);

    const { lines } = aggregateIngredients({ event, recipes });
    expect(lines[0].amount).toBe(300); // 30 g × 10 = 300 g (under 1 kg → stays g)
    expect(lines[0].unit).toBe('g');
  });

  it('keeps unconvertible same-name ingredients as SEPARATE lines + emits a warning — never silently guesses unit mappings (Rule 12)', () => {
    const a = recipe('r_a', 'A', 1, [ing('Onion', 2, 'cup')]); // volume
    const b = recipe('r_b', 'B', 1, [ing('Onion', 100, 'g')]);  // weight
    const event = evt([dish('d_a', 'A', 'r_a', 1), dish('d_b', 'B', 'r_b', 1)]);
    const recipes = new Map([[a.id, a], [b.id, b]]);

    const { lines, warnings } = aggregateIngredients({ event, recipes });
    const onionLines = lines.filter((l) => l.name === 'Onion');
    expect(onionLines).toHaveLength(2);
    expect(warnings.some((w) => /different unit families/i.test(w.message))).toBe(true);
  });

  it('expands sub-recipe references — fractional contribution based on parent quantity vs sub total volume', () => {
    // Sauce: yields 4 portions of "sauce". Total liquid in the recipe = 400 ml (stock + cream).
    const sauce = recipe('r_sauce', 'Sauce', 4, [
      ing('Stock', 200, 'ml'),
      ing('Cream', 200, 'ml'),
    ]);
    // Ribeye uses 80 ml of sauce → 80/400 = 0.2 fraction.
    const ribeye = recipe('r_ribeye', 'Ribeye', 1, [
      ing('Beef', 700, 'g'),
      ing('Sauce', 80, 'ml', { componentRecipeId: 'r_sauce' }),
    ]);
    const event = evt([dish('d1', 'Ribeye', 'r_ribeye', 1)]);
    const recipes = new Map([[sauce.id, sauce], [ribeye.id, ribeye]]);

    const { lines, warnings } = aggregateIngredients({ event, recipes });

    expect(warnings).toEqual([]);
    const stock = lines.find((l) => l.name === 'Stock');
    const cream = lines.find((l) => l.name === 'Cream');
    expect(stock).toBeDefined();
    expect(cream).toBeDefined();
    // 200 ml × 0.2 = 40 ml each
    expect(stock!.amount).toBeCloseTo(40, 0);
    expect(cream!.amount).toBeCloseTo(40, 0);
    // The original 80ml sauce LINE should NOT appear — it's been expanded.
    expect(lines.find((l) => l.name === 'Sauce')).toBeUndefined();
  });

  it('falls back to one full sub-recipe batch + warns when the sub has no compatible-unit total (Rule 12 fail-loud)', () => {
    const sub = recipe('r_sub', 'Sub', 1, [ing('Spice', 5, 'g')]); // weight-only sub
    const parent = recipe('r_parent', 'Parent', 1, [
      ing('Sub', 100, 'ml', { componentRecipeId: 'r_sub' }), // referenced in ml — incompatible
    ]);
    const event = evt([dish('d1', 'Parent', 'r_parent', 1)]);
    const recipes = new Map([[sub.id, sub], [parent.id, parent]]);

    const { lines, warnings } = aggregateIngredients({ event, recipes });
    const spice = lines.find((l) => l.name === 'Spice');
    expect(spice).toBeDefined();
    expect(spice!.amount).toBe(5); // one full batch — verbatim
    expect(warnings.some((w) => /batch size/i.test(w.message))).toBe(true);
  });

  it('emits a warning + skips ingredients when a dish references a missing recipe — chef sees that gap, not a silent zero', () => {
    const event = evt([dish('d1', 'Mystery', 'r_missing', 1)]);
    const { lines, warnings } = aggregateIngredients({ event, recipes: new Map() });
    expect(lines).toEqual([]);
    expect(warnings.some((w) => /not found/i.test(w.message))).toBe(true);
  });

  it('skips prepared dishes entirely — pre-made items contribute zero ingredients', () => {
    const event = evt([
      { id: 'd_bakery', name: 'Bread rolls', isPrepared: true, portions: 4, startAt: '2026-05-14T17:00:00.000Z' },
    ]);
    const { lines, warnings } = aggregateIngredients({ event, recipes: new Map() });
    expect(lines).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('sorts output alphabetically — chefs scan a stable list, not whatever insertion order the schedule produced', () => {
    const r = recipe('r', 'R', 1, [
      ing('Zucchini', 100, 'g'),
      ing('Apple', 100, 'g'),
      ing('Mango', 100, 'g'),
    ]);
    const event = evt([dish('d1', 'R', 'r', 1)]);
    const { lines } = aggregateIngredients({ event, recipes: new Map([[r.id, r]]) });
    expect(lines.map((l) => l.name)).toEqual(['Apple', 'Mango', 'Zucchini']);
  });
});
