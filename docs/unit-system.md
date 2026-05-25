# Unit System

ChefFlow's unit conversion engine lives entirely in `chefflow/src/core/units/` and `chefflow/src/core/scaler/`. It is decoupled from the UI — all functions are pure and testable independently.

## Unit system modes

The `UnitSystem` type has three values (`chefflow/src/core/types.ts`):

| Mode | Description |
|------|-------------|
| `metric` | Display all weights in g/kg and volumes in ml/L |
| `imperial` | Display all weights in oz/lb and volumes in cup/fl oz/etc. |
| `auto` | Preserve each ingredient's original unit — no conversion applied |

> **NOTE:** The Zustand store that holds the active unit system exists at `chefflow/src/state/unitSystemStore.ts`. A UI toggle component (Metric/Imperial/Auto) is currently deferred. See `ToDoList.md § Unit System Toggle`.

## Ingredient scaling syntax

Ingredients are tagged in the recipe's Markdown body using the `{amount|unit|name}` syntax:

```
- [ ] {800|g|Beef Chuck}
- [ ] {2|tbsp|Tomato Paste}
- [ ] {5|g|Salt} (LOCKED)
```

The parser (`chefflow/src/core/parser/parseRecipe.ts`) extracts `amount`, `unit`, and `name` via regex. The `(LOCKED)` suffix sets `Ingredient.isLocked = true`.

## Portion scaling

**Module:** `chefflow/src/core/scaler/scaleRecipe.ts`

```typescript
scaleRecipe(recipe: Recipe, opts: ScaleOptions): Recipe
// ScaleOptions = { targetPortions: number; system: UnitSystem }
```

### How scaling works

1. Compute the ratio: `targetPortions / recipe.originalYield`.
2. For each ingredient:
   - If `isLocked === true`, return the ingredient unchanged.
   - Multiply `amount` by the ratio using `Decimal.js` to avoid floating-point drift.
   - If `system` is `metric` or `imperial`, convert the unit to the target system's canonical unit (e.g. `oz` → `g` for metric).
   - Normalize to a larger unit when thresholds are met.
   - Round to a chef-friendly precision.

### Lock feature

Marking an ingredient as locked prevents over-scaling of seasoning:

```markdown
- [ ] {5|g|Salt} (LOCKED)
- [ ] {2|g|Black pepper} (LOCKED)
```

Locked ingredients pass through `scaleRecipe` unchanged regardless of the target portion count.

## Unit conversion

**Module:** `chefflow/src/core/units/convert.ts`

```typescript
convertUnit(amount: number, from: string, to: string): number
```

All conversions go through a two-step intermediate: weights normalize to grams, volumes to milliliters. `Decimal.js` is used for all arithmetic.

### Supported units

**Weight**

| Unit | Symbol | Base factor (g) |
|------|--------|----------------|
| Gram | `g` | 1 |
| Kilogram | `kg` | 1000 |
| Ounce | `oz` | 28.3495 |
| Pound | `lb` | 453.592 |

**Volume**

| Unit | Symbol | Base factor (ml) |
|------|--------|-----------------|
| Milliliter | `ml` | 1 |
| Liter | `L` / `l` | 1000 |
| Teaspoon | `tsp` | 4.929 |
| Tablespoon | `tbsp` | 14.787 |
| Cup | `cup` | 236.588 |
| Fluid ounce | `fl oz` | 29.574 |
| Pint | `pt` | 473.176 |
| Quart | `qt` | 946.353 |
| Gallon | `gal` | 3785.41 |

**Temperature**

| Conversion | Formula |
|------------|---------|
| °C → °F | `amount × 9/5 + 32` |
| °F → °C | `(amount − 32) × 5/9` |

Pass `'C'` and `'F'` as the unit symbols.

> **WARNING:** `convertUnit` throws if you attempt to convert between dimensions (e.g. grams to milliliters). Dimension detection is based on the unit lookup tables — any unknown unit also throws.

## Normalization

**Module:** `chefflow/src/core/units/normalize.ts`

`normalizeMeasurement(amount, unit, system)` upgrades small units to the next larger unit when a threshold is crossed:

| System | Condition | Result |
|--------|-----------|--------|
| `metric` | `amount ≥ 1000` and `unit === 'g'` | → `kg` |
| `metric` | `amount ≥ 1000` and `unit === 'ml'` | → `L` |
| `imperial` | `amount ≥ 16` and `unit === 'oz'` | → `lb` |

### Scaler normalization vs. display normalization

`scaleRecipe.ts` uses its own `normalizeScaled()` function rather than `normalizeMeasurement()` from `normalize.ts`. The difference:

- `normalizeMeasurement` applies `roundSensible()` after the unit upgrade.
- `normalizeScaled` for metric paths skips the extra rounding to preserve exact results (e.g. `2400g → 2.4kg`, not `2.5kg`).
- `normalizeScaled` for the `oz → lb` path still applies `roundSensible()` because imperial fractions benefit from chef-friendly rounding.

## Chef-friendly rounding

`roundSensible(amount)` in `normalize.ts` rounds to a step size based on magnitude:

| Range | Step |
|-------|------|
| `> 100` | 0.5 |
| `10 – 100` | 0.1 |
| `< 10` | 0.25 |

Whole numbers are always returned exactly.

## Unit selection during scaling

When `system` is `metric`, `scaleRecipe` maps incoming imperial units to metric equivalents:

| Incoming | Target |
|----------|--------|
| `oz`, `lb` | `g` |
| `tsp`, `tbsp`, `cup`, `fl oz`, `pt`, `qt`, `gal` | `ml` |

When `system` is `imperial`:

| Incoming | Target |
|----------|--------|
| `g`, `kg` | `oz` |
| `ml`, `L`, `l` | `cup` |

When `system` is `auto`, the source unit is preserved.
