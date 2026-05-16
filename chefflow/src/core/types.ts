export type UnitSystem = 'metric' | 'imperial' | 'auto';

export type ThermalClass = 'flash' | 'stable' | 'normal';
export type AllergenClass = 'allergen-free' | 'allergen';
export type StepKind = 'active' | 'passive';
export type StepPhase = 'prep' | 'cook' | 'serve';
export type SchedulePhase = StepPhase | 'sanitize';

export interface Ingredient {
  id: string;
  raw: string;          // e.g. "{800|g|Beef Chuck}"
  amount: number;
  unit: string;
  name: string;
  isLocked: boolean;
}

export interface WorkflowStep {
  id: string;
  text: string;         // markdown body (may include <Timer …>)
  durationSec?: number;
  kind: StepKind;
  equipment?: string[];
  thermalClass: ThermalClass;
  allergenClass: AllergenClass;
  dependsOn: string[];
  batchKey?: string;
  panCapacityPortions?: number;
  phase: StepPhase;
}

// Closed taxonomy: the 14 allergens UK food law requires businesses to declare.
// Tag keys are kebab-case so they round-trip cleanly through JSON / IndexedDB.
// See src/core/recipes/llm/allergens.ts for display labels + examples.
export type AllergenTag =
  | 'celery'
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'lupin'
  | 'milk'
  | 'molluscs'
  | 'mustard'
  | 'peanuts'
  | 'sesame'
  | 'soybeans'
  | 'sulphites'
  | 'tree-nuts';

export interface RecipeAnalysis {
  caloriesPerPortion?: number;
  caloriesTotal?: number;
  keyIngredientTags?: string[];     // 2–6 lowercase headline ingredients (e.g. "beef")
  allergens?: AllergenTag[];        // closed UK-14 set, deduped
  analyzedAt?: number;              // epoch ms
  source?: 'llm-text' | 'llm-vision' | 'manual';
}

export interface Recipe {
  id: string;
  title: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  analysis?: RecipeAnalysis;
}

export interface Dish {
  id: string;
  name: string;
  recipeId?: string;     // set when linked to a recipe in the library
  isPrepared?: boolean;  // user marked "I'll get the dish ready" (no recipe)
  portions: number;
  startAt: string;       // ISO datetime
  notes?: string;
  colorTag?: ColorTag;   // assigned color — used to mark which chef owns the dish
}

export interface KitchenEvent {
  id: string;
  title: string;
  serveAt?: string;      // ISO datetime — when food is served / event anchor
  notes: string;
  dishes: Dish[];
  createdAt: number;
  updatedAt: number;

  // Plan 3: saved workflow snapshot — present once user clicks Save on the
  // workflow page. Staleness is detected by comparing workflowDishesHash to
  // a fresh hash of dishes; mismatched → show a banner offering Regenerate.
  workflow?: ScheduledStep[];
  workflowDishesHash?: string;
}

export type ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface ScheduledStep {
  // identity — synthesized as `${dishId}:${recipeStepId}`, unique across the workflow
  id: string;
  dishId: string;
  recipeId: string;
  recipeStepId: string;

  // display
  dishLabel: string;
  text: string;

  // timing — ISO strings so the structure round-trips through JSON / MCP / Dexie
  startAt: string;
  endAt: string;
  durationSec: number;

  // step metadata pulled forward from the underlying WorkflowStep so a single
  // ScheduledStep is self-contained for the LLM tool and the UI
  phase: SchedulePhase;
  kind: StepKind;
  thermalClass: ThermalClass;
  allergenClass: AllergenClass;
  dependsOnStepIds: string[];

  // user-editable overlay
  colorTag?: ColorTag;
  manualOrderHint?: number;

  // diagnostics
  warnings: string[];
  rulesApplied: number[];   // which CulinaryRule.md rules drove this placement
}
