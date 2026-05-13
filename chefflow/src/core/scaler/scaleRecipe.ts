import type { Recipe, Ingredient, UnitSystem } from '../types';
import type { Measurement } from '../units/normalize';
import { convertUnit } from '../units/convert';
import { roundSensible } from '../units/normalize';
import Decimal from 'decimal.js';

export interface ScaleOptions {
  targetPortions: number;
  system: UnitSystem;
}

export function scaleRecipe(recipe: Recipe, opts: ScaleOptions): Recipe {
  if (recipe.originalYield <= 0) {
    throw new Error('Recipe originalYield must be > 0');
  }
  const ratio = new Decimal(opts.targetPortions).div(recipe.originalYield).toNumber();
  return {
    ...recipe,
    ingredients: recipe.ingredients.map(i => scaleIngredient(i, ratio, opts.system)),
    updatedAt: Date.now(),
  };
}

// Scaler-specific normalization: the metric upgrade paths (g→kg, ml→L)
// deliberately skip roundSensible to preserve exact arithmetic results
// like 2400g → 2.4kg (roundSensible would yield 2.5kg under the <10/step-0.25
// rule). Imperial oz→lb still uses roundSensible because oz→lb conversion
// yields messier fractions where chef-friendly rounding helps.
/**
 * Normalize a measurement: upgrade small units to larger ones when thresholds
 * are met, without applying extra rounding after division (preserving exact
 * arithmetic values like 2400g → 2.4kg).
 */
function normalizeScaled(amount: number, unit: string, system: UnitSystem): Measurement {
  const effectiveSystem = system === 'auto' ? guessSystem(unit) : system;
  if (effectiveSystem === 'metric') {
    if (unit === 'g' && amount >= 1000) {
      return { amount: amount / 1000, unit: 'kg' };
    }
    if (unit === 'ml' && amount >= 1000) {
      return { amount: amount / 1000, unit: 'L' };
    }
  } else if (effectiveSystem === 'imperial') {
    if (unit === 'oz' && amount >= 16) {
      return { amount: roundSensible(amount / 16), unit: 'lb' };
    }
  }
  return { amount: roundSensible(amount), unit };
}

function scaleIngredient(i: Ingredient, ratio: number, system: UnitSystem): Ingredient {
  if (i.isLocked) return i;
  const scaledAmount = new Decimal(i.amount).mul(ratio).toNumber();
  const targetUnit = chooseTargetUnit(i.unit, system);
  const converted = convertUnit(scaledAmount, i.unit, targetUnit);
  const norm = normalizeScaled(converted, targetUnit, system);
  return {
    ...i,
    amount: norm.amount,
    unit: norm.unit,
    raw: `{${norm.amount}|${norm.unit}|${i.name}}`,
  };
}

function chooseTargetUnit(sourceUnit: string, system: UnitSystem): string {
  if (system === 'auto') return sourceUnit;
  const metricWeight = new Set(['g', 'kg']);
  const imperialWeight = new Set(['oz', 'lb']);
  const metricVolume = new Set(['ml', 'L', 'l']);
  const imperialVolume = new Set(['tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal']);

  if (system === 'metric') {
    if (imperialWeight.has(sourceUnit)) return 'g';
    if (imperialVolume.has(sourceUnit)) return 'ml';
    return sourceUnit;
  }
  // imperial
  if (metricWeight.has(sourceUnit)) return 'oz';
  if (metricVolume.has(sourceUnit)) return 'cup';
  return sourceUnit;
}

function guessSystem(unit: string): UnitSystem {
  const imp = new Set(['oz', 'lb', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal']);
  return imp.has(unit) ? 'imperial' : 'metric';
}
