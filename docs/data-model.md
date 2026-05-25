# Data Model

All types are defined in `chefflow/src/core/types.ts`. Persistence uses Dexie 4 on top of IndexedDB (`chefflow/src/db/dexie.ts`).

## Dexie schema

```
Database name: chefflow
```

| Table | Key | Indexed columns | TypeScript type |
|-------|-----|-----------------|-----------------|
| `recipes` | `id` | `updatedAt`, `title` | `Recipe` |
| `events` | `id` | `updatedAt`, `title`, `serveAt` | `KitchenEvent` |

### Schema history

| Version | Change |
|---------|--------|
| 1 | `recipes` table created |
| 2 | `events` table added |
| 3 | Migration: `events.sessions[]` renamed to `events.dishes[]` |

See `chefflow/src/db/dexie.ts` for the full migration logic.

## Core types

### `Recipe`

The primary domain object. Stored in the `recipes` table.

```typescript
interface Recipe {
  id: string;
  title: string;
  originalYield: number;       // number of portions the recipe is written for
  prepTime?: string;           // e.g. "30m"
  cookTime?: string;           // e.g. "2h"
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;           // epoch ms
  updatedAt: number;           // epoch ms
  isPinned?: boolean;
  analysis?: RecipeAnalysis;
  pricePerPortion?: number;    // cost in GBP per portion; used in event budget checks
}
```

### `Ingredient`

Each ingredient row on a recipe.

```typescript
interface Ingredient {
  id: string;
  raw: string;                 // serialized form, e.g. "{800|g|Beef Chuck}"
  amount: number;
  unit: string;
  name: string;
  isLocked: boolean;           // true → scaler skips this ingredient
  allergenFlags?: AllergenTag[]; // undefined → auto-detect; [] → user cleared; [...] → user override
}
```

The `raw` field is the canonical `{amount|unit|name}` syntax used by the Markdown parser and serializer. See [unit-system.md](./unit-system.md) for the scaling syntax.

### `WorkflowStep`

One step in a recipe's preparation workflow.

```typescript
interface WorkflowStep {
  id: string;
  text: string;                // Markdown body; may include <Timer duration="Ns">
  durationSec?: number;        // parsed from Timer tag if present
  kind: 'active' | 'passive'; // active = chef present; passive = oven/rest time
  equipment?: string[];
  thermalClass: 'flash' | 'stable' | 'normal';
  allergenClass: 'allergen-free' | 'allergen';
  dependsOn: string[];         // step IDs this step cannot start before
  batchKey?: string;           // groups steps that can be consolidated across dishes
  panCapacityPortions?: number;
  phase: 'prep' | 'cook' | 'serve';
}
```

### `AllergenTag`

Closed UK-14 allergen taxonomy. Values are kebab-case strings that round-trip through JSON and IndexedDB.

```typescript
type AllergenTag =
  | 'celery' | 'gluten' | 'crustaceans' | 'eggs' | 'fish'
  | 'lupin' | 'milk' | 'molluscs' | 'mustard' | 'peanuts'
  | 'sesame' | 'soybeans' | 'sulphites' | 'tree-nuts';
```

Display labels and example ingredients are in `chefflow/src/core/recipes/llm/allergens.ts`.

### `RecipeAnalysis`

LLM-generated or manually-entered nutritional and allergen metadata on a Recipe.

```typescript
interface RecipeAnalysis {
  caloriesPerPortion?: number;
  caloriesTotal?: number;
  keyIngredientTags?: string[];  // 2–6 lowercase headline ingredients
  allergens?: AllergenTag[];     // deduped set from the UK-14 taxonomy
  analyzedAt?: number;           // epoch ms
  source?: 'llm-text' | 'llm-vision' | 'manual';
}
```

### `KitchenEvent`

An event (dinner service, catering job, etc.) with a collection of dishes. Stored in the `events` table.

```typescript
interface KitchenEvent {
  id: string;
  title: string;
  serveAt?: string;            // ISO datetime — when food must be on the table
  location?: string;           // venue / address; opens Google Maps when set
  budget?: number;             // cost ceiling in GBP
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes: string;               // general notes + guest dietary requirements
  dishes: Dish[];
  sections?: EventSection[];   // user-defined course buckets (Starters, Mains, etc.)
  createdAt: number;
  updatedAt: number;
  workflow?: ScheduledStep[];         // saved workflow snapshot
  workflowDishesHash?: string;        // staleness check — compare against fresh hash
  menuAnalysis?: MenuAnalysis;        // LLM menu suitability verdict
}
```

### `Dish`

One dish on an event. Optionally linked to a Recipe in the library.

```typescript
interface Dish {
  id: string;
  name: string;
  recipeId?: string;           // set when linked to a recipe
  isPrepared?: boolean;        // true → chef marks dish as "no recipe needed"
  portions: number;
  startAt: string;             // ISO datetime — when prep for this dish begins
  notes?: string;
  colorTag?: ColorTag;         // chef ownership color
}
```

### `EventSection`

A named bucket of dishes within an event (e.g. "Starters", "Mains"). The mapping lives on the event, not on Dish itself.

```typescript
interface EventSection {
  id: string;
  name: string;
  dishIds: string[];
}
```

Section helpers (grouping, moving, removing) live in `chefflow/src/core/events/sections.ts`.

### `ScheduledStep`

One time-placed step in a saved workflow. Self-contained so it can be passed to the LLM and rendered in the UI without re-loading the source recipe.

```typescript
interface ScheduledStep {
  id: string;                  // "${dishId}:${recipeStepId}"
  dishId: string;
  recipeId: string;
  recipeStepId: string;
  dishLabel: string;
  text: string;
  startAt: string;             // ISO datetime
  endAt: string;               // ISO datetime
  durationSec: number;
  phase: SchedulePhase;        // 'prep' | 'cook' | 'serve' | 'sanitize'
  kind: StepKind;
  thermalClass: ThermalClass;
  allergenClass: AllergenClass;
  dependsOnStepIds: string[];
  colorTag?: ColorTag;
  manualOrderHint?: number;
  warnings: string[];
  rulesApplied: number[];      // which CulinaryRule.md rules drove this placement
}
```

### `MenuAnalysis`

LLM verdict on whether the dish lineup suits the declared dietary requirements on a `KitchenEvent`.

```typescript
interface MenuAnalysis {
  verdict: 'ok' | 'warnings' | 'blocked';
  issues: MenuIssue[];         // each has severity ('warning' | 'blocker') + message
  suggestions: string[];
  analyzedAt: number;
}
```

### `ColorTag`

```typescript
type ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
```

Used to assign chef ownership to a dish or scheduled step.

## Recipe Markdown format

Recipes are stored as structured objects in IndexedDB, but are authored and exported in a Markdown format with YAML front matter. The parser lives in `chefflow/src/core/parser/parseRecipe.ts`; the serializer in `serializeRecipe.ts`.

```markdown
---
recipe_id: "beef-stew-001"
original_yield: 4
prep_time: 30m
cook_time: 2h
---
# Red Wine Beef Stew

## Ingredients
- [ ] {800|g|Beef Chuck}
- [ ] {2|tbsp|Tomato Paste}
- [ ] {5|g|Salt} (LOCKED)

## Workflow
1. <step phase="prep">Dice onions and mince garlic.</step>
2. <step kind="active" thermal="flash" phase="cook">
   <Timer duration="600s">Sear the beef</Timer> until browned.
   </step>
3. Deglaze the pan with red wine.
```

### Front matter fields

| Field | Type | Description |
|-------|------|-------------|
| `recipe_id` | string | Maps to `Recipe.id` |
| `original_yield` | number | Portions the recipe is written for |
| `prep_time` | string | Human-readable prep duration |
| `cook_time` | string | Human-readable cook duration |

### Ingredient syntax

```
- [ ] {amount|unit|name}
- [ ] {amount|unit|name} (LOCKED)
```

The `(LOCKED)` suffix sets `Ingredient.isLocked = true`, preventing the portion scaler from touching this ingredient.

### Step tag attributes

Optional `<step ...>` wrappers let you annotate steps without affecting the displayed text:

| Attribute | Values | Default |
|-----------|--------|---------|
| `id` | string | auto-generated |
| `phase` | `prep`, `cook`, `serve` | `cook` |
| `kind` | `active`, `passive` | `active` |
| `thermal` | `flash`, `stable`, `normal` | `normal` |
| `allergen` | `allergen`, `allergen-free` | `allergen-free` |
| `depends` | comma-separated step IDs | none |
| `batch` | string | none |
| `pan-capacity` | number (portions) | none |

### Timer syntax

```html
<Timer duration="600s">Sear the beef</Timer>
```

Sets `WorkflowStep.durationSec = 600`. The scheduler uses this value to place the step on the timeline.

## Repository helpers

| File | Exposes |
|------|---------|
| `chefflow/src/db/recipesRepo.ts` | `getRecipe`, `listRecipes`, `saveRecipe`, `deleteRecipe` |
| `chefflow/src/db/eventsRepo.ts` | `getEvent`, `listEvents`, `saveEvent`, `deleteEvent` |
