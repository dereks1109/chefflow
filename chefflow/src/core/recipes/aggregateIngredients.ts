import type { Ingredient, KitchenEvent, Recipe } from '../types';
import { convertUnit } from '../units/convert';
import { normalizeMeasurement } from '../units/normalize';

// ---------------------------------------------------------------------------
// aggregateIngredients — produce a chef-ready shopping list for an event.
//
// Walks each dish in the event, scales every ingredient by
//   ratio = dish.portions / recipe.originalYield
// then merges across dishes by (lowercase-name, compatible-unit-family).
// Tomato 200g in salad + Tomato 1kg in soup collapses to one line
// "1.2 kg Tomato — used in: Garden Salad, Tomato Soup".
//
// `#` sub-recipe references (`ingredient.componentRecipeId`) expand into
// the sub-recipe's own ingredients, scaled by the fraction
//   parent_ingredient_amount / sub_recipe_total_volume_in_same_unit
// so 80 ml of a 415-ml sauce contributes ~19% of each sauce ingredient.
// If the sub-recipe has no compatible-unit total (e.g. weight-only sub
// referenced by a volume parent) we emit ONE BATCH of the sub's
// ingredients verbatim and surface a warning (Rule 12 — fail loud, never
// silently fabricate amounts).
//
// Unconvertible same-name ingredients (e.g. "2 onions" + "100 g onion")
// stay as two separate lines, both carrying their dish tags. We do NOT
// guess unit-of-measure mappings — that's a Rule 12 fail-loud boundary.
//
// Cycles + depth: tracked via a visited set, capped at depth 5.
// ---------------------------------------------------------------------------

export interface OrderListLine {
  /** Display amount after normalisation (e.g. 2.4 for "2.4 kg"). */
  amount: number;
  /** Display unit after normalisation (e.g. "kg"). */
  unit: string;
  /** Canonical ingredient name (preserves the casing of the first occurrence). */
  name: string;
  /** Dishes that contributed to this line. Order: first appearance wins. */
  dishNames: string[];
  /** Per-dish contributions in the chef-authored unit (NOT normalised),
   *  scaled by dish.portions / recipe.originalYield. Two entries for the
   *  same (dish, unit) are summed into one. Lets the workflow page show
   *  "10g for Salad / 5g for Lamb Rack" under a single ingredient heading
   *  while the aggregate `amount`+`unit` stays available for callers that
   *  want the shopping-total view. */
  breakdown: { amount: number; unit: string; dishName: string }[];
}

export interface OrderListWarning {
  /** Human-readable explanation surfaced in the UI. */
  message: string;
  /** Best-effort dish context, if applicable. */
  dishName?: string;
}

export interface OrderListResult {
  lines: OrderListLine[];
  warnings: OrderListWarning[];
}

export interface AggregateInput {
  event: KitchenEvent;
  recipes: Map<string, Recipe>;
}

interface UnitFamily {
  /** Canonical base unit for the family ('g' for weight, 'ml' for volume, '' for counted/unknown). */
  base: 'g' | 'ml' | '';
  /** Display unit for output rendering. Set to the source unit so the chef sees what they wrote. */
  displayUnit: string;
}

const WEIGHT_UNITS = new Set(['g', 'kg', 'oz', 'lb']);
const VOLUME_UNITS = new Set(['ml', 'l', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal']);

function familyOf(unit: string): UnitFamily {
  if (WEIGHT_UNITS.has(unit)) return { base: 'g', displayUnit: unit };
  if (VOLUME_UNITS.has(unit)) return { base: 'ml', displayUnit: unit };
  return { base: '', displayUnit: unit };
}

interface Accumulator {
  /** Sum in the family's base unit (g or ml). For counted/unknown units, stored as-is. */
  baseAmount: number;
  /** Family info recorded on first contribution. */
  family: UnitFamily;
  /** Original recipe-authored name with first-seen casing. */
  name: string;
  /** Insertion-ordered set of dish names. */
  dishNames: Set<string>;
  /** Per-dish contributions in the chef-authored unit. Same (dish, unit)
   *  is summed in place — see addContribution(). */
  contributions: { amount: number; unit: string; dishName: string }[];
}

/** Merge a per-dish contribution into the accumulator, summing when an
 *  entry with the same (dishName, unit) already exists. Keeps "100 g
 *  flour + 50 g flour in one recipe for dish X" as a single
 *  "150 g for X" breakdown row instead of two duplicate rows. */
function addContribution(
  acc: Accumulator,
  amount: number,
  unit: string,
  dishName: string,
): void {
  const existing = acc.contributions.find(
    (c) => c.dishName === dishName && c.unit === unit,
  );
  if (existing) {
    existing.amount += amount;
    return;
  }
  acc.contributions.push({ amount, unit, dishName });
}

/**
 * Aggregate an event's ingredients into a flat shopping list. Pure function
 * — no I/O, no mutation of inputs.
 */
export function aggregateIngredients(input: AggregateInput): OrderListResult {
  const { event, recipes } = input;
  const buckets = new Map<string, Accumulator>();
  const warnings: OrderListWarning[] = [];

  for (const dish of event.dishes) {
    if (dish.isPrepared) continue; // pre-prepared — no recipe to aggregate from
    if (!dish.recipeId) continue;
    const recipe = recipes.get(dish.recipeId);
    if (!recipe) {
      warnings.push({
        message: `Recipe for dish "${dish.name || dish.id}" not found — ingredients omitted.`,
        dishName: dish.name,
      });
      continue;
    }
    const dishLabel = dish.name || recipe.title || 'Untitled dish';
    const dishRatio = recipe.originalYield > 0 ? dish.portions / recipe.originalYield : 1;
    for (const ing of recipe.ingredients) {
      contributeIngredient(ing, dishRatio, dishLabel, recipes, buckets, warnings, new Set([recipe.id]), 0);
    }
  }

  const lines: OrderListLine[] = Array.from(buckets.values()).map((acc) => {
    const displayAmount = acc.family.base
      ? convertUnit(acc.baseAmount, acc.family.base, acc.family.displayUnit)
      : acc.baseAmount;
    const norm = acc.family.base
      ? normalizeMeasurement(displayAmount, acc.family.displayUnit, 'metric')
      : { amount: displayAmount, unit: acc.family.displayUnit };
    return {
      amount: norm.amount,
      unit: norm.unit,
      name: acc.name,
      dishNames: Array.from(acc.dishNames),
      breakdown: acc.contributions,
    };
  });

  // Stable order: by name, lowercase.
  lines.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { lines, warnings };
}

function contributeIngredient(
  ing: Ingredient,
  parentRatio: number,
  dishLabel: string,
  recipes: Map<string, Recipe>,
  buckets: Map<string, Accumulator>,
  warnings: OrderListWarning[],
  visited: Set<string>,
  depth: number,
): void {
  // Sub-recipe expansion — `#` ingredient lines reference another recipe.
  // We add the SUB's ingredients (scaled by parent's literal quantity vs
  // the sub's total volume) instead of the literal "80 ml sauce" line.
  if (ing.componentRecipeId) {
    if (depth >= 5) {
      warnings.push({ message: `Sub-recipe expansion depth exceeded at "${ing.name}" — skipped.`, dishName: dishLabel });
      return;
    }
    if (visited.has(ing.componentRecipeId)) {
      warnings.push({ message: `Sub-recipe cycle at "${ing.name}" — skipped.`, dishName: dishLabel });
      return;
    }
    const sub = recipes.get(ing.componentRecipeId);
    if (!sub) {
      warnings.push({ message: `Referenced recipe missing for "${ing.name}" — skipped.`, dishName: dishLabel });
      return;
    }
    const parentFamily = familyOf(ing.unit);
    let subFraction: number | null = null;
    if (parentFamily.base) {
      // Sum the sub's compatible-unit ingredients into a single base-unit total.
      let subTotalInBase = 0;
      for (const subIng of sub.ingredients) {
        const f = familyOf(subIng.unit);
        if (f.base === parentFamily.base) {
          subTotalInBase += convertUnit(subIng.amount, subIng.unit, parentFamily.base);
        }
      }
      if (subTotalInBase > 0) {
        const parentInBase = convertUnit(ing.amount, ing.unit, parentFamily.base);
        subFraction = parentInBase / subTotalInBase;
      }
    }
    if (subFraction === null) {
      // Couldn't compute fraction — emit one batch verbatim and warn.
      warnings.push({
        message: `Couldn't derive "${sub.title}" batch size from "${ing.name}" — using 1 full batch.`,
        dishName: dishLabel,
      });
      subFraction = 1;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(ing.componentRecipeId);
    // Breadcrumb provenance: each level of sub-recipe descent appends
    // " > <sub.title>". Chefs reading the order list at the station need
    // to know which sub-dish an ingredient is for (Rule 9 — encodes WHY).
    const subDishLabel = `${dishLabel} > ${sub.title || 'Untitled sub-recipe'}`;
    for (const subIng of sub.ingredients) {
      contributeIngredient(subIng, parentRatio * subFraction, subDishLabel, recipes, buckets, warnings, nextVisited, depth + 1);
    }
    return;
  }

  const family = familyOf(ing.unit);
  const scaledAmount = ing.amount * parentRatio;
  const nameLc = ing.name.trim().toLowerCase();
  const key = `${nameLc}::${family.base || family.displayUnit}`;

  const existing = buckets.get(key);
  if (existing) {
    // Same name + same unit family → merge.
    if (family.base) {
      existing.baseAmount += convertUnit(scaledAmount, ing.unit, family.base);
    } else {
      existing.baseAmount += scaledAmount;
    }
    existing.dishNames.add(dishLabel);
    addContribution(existing, scaledAmount, ing.unit, dishLabel);
    return;
  }

  // No existing bucket at this exact key — but is there another bucket with
  // the same name in a DIFFERENT unit family? That's a clash; we keep the
  // lines separate AND surface a warning so the chef notices the friction
  // rather than us silently guessing a unit mapping (Rule 12 — fail loud).
  let clash = false;
  for (const [otherKey, otherBucket] of buckets) {
    if (otherKey === key) continue;
    if (otherBucket.name.trim().toLowerCase() === nameLc) {
      clash = true;
      break;
    }
  }

  buckets.set(key, {
    baseAmount: family.base ? convertUnit(scaledAmount, ing.unit, family.base) : scaledAmount,
    family,
    name: ing.name.trim() || '(unnamed)',
    dishNames: new Set([dishLabel]),
    contributions: [{ amount: scaledAmount, unit: ing.unit, dishName: dishLabel }],
  });

  if (clash) {
    warnings.push({
      message: `"${ing.name}" appears in two different unit families — listed as separate lines.`,
      dishName: dishLabel,
    });
  }
}
