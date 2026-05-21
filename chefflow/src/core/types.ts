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
  // User override of the regex-based allergen auto-detection.
  // undefined → use auto-detection (findAllergensInIngredient against recipe.analysis.allergens)
  // []        → user explicitly cleared the highlight
  // [tag...]  → user explicitly flagged these allergens
  allergenFlags?: AllergenTag[];
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
  // Cost per portion in GBP. Optional — older recipes leave this undefined and
  // the event-total math treats them as zero. UI formats with formatGBP().
  pricePerPortion?: number;
  /** Base64 JPEG data URL, downscaled to <=1600px. Stored in Dexie. */
  coverPhoto?: string;
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

// A named bucket of dishes on an event (e.g. "Starters", "Mains"). The
// dish-to-section mapping lives here — Dish itself stays clean. A dish ID may
// appear in at most one section; dishes not in any section are rendered under
// "Unassigned" at the top of the timeline.
export interface EventSection {
  id: string;
  name: string;
  dishIds: string[];
}

export interface KitchenEvent {
  id: string;
  title: string;
  serveAt?: string;      // ISO datetime — when food is served / event anchor
  location?: string;     // freeform venue / address — opens in Google Maps when set
  // Cost ceiling for the event in GBP. Compared against the sum of priced
  // dishes (recipe.pricePerPortion × dish.portions) by the menu-suitability
  // check, which surfaces an over-budget warning when present.
  budget?: number;
  // Point-of-contact for the event — host, client, or whoever the chef should
  // reach out to. All three fields are optional; UI renders the email as a
  // mailto: link and the phone as a tel: link when present.
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Number of expected guests. Optional — older events leave it undefined.
  // Surfaced on the EventView detail card and used by the LLM menu check as
  // an explicit signal (previously buried inside the notes free-text).
  numberOfGuests?: number;
  // Combined freeform field: general event notes + guest dietary requirements.
  // The LLM menu-suitability check reads dietary intent from here.
  notes: string;
  dishes: Dish[];
  // User-defined menu sections (containers of dishIds). Optional — older
  // events without this field render every dish under "Unassigned" until the
  // user creates sections + drags dishes in.
  sections?: EventSection[];
  createdAt: number;
  updatedAt: number;

  // Plan 3: saved workflow snapshot — present once user clicks Save on the
  // workflow page. Staleness is detected by comparing workflowDishesHash to
  // a fresh hash of dishes; mismatched → show a banner offering Regenerate.
  workflow?: ScheduledStep[];
  workflowDishesHash?: string;

  // LLM verdict for whether the dish lineup suits the declared dietary
  // requirements. Refreshed manually via the "Analyse menu" button.
  menuAnalysis?: MenuAnalysis;
}

export type MenuIssueSeverity = 'warning' | 'blocker';

export interface MenuIssue {
  severity: MenuIssueSeverity;
  message: string;
}

export interface Menu {
  id: string;
  title: string;
  description?: string;
  recipeIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MenuAnalysis {
  // 'ok' — no issues. 'warnings' — soft conflicts (e.g. limited vegan options).
  // 'blocked' — at least one guest can't eat anything safely.
  verdict: 'ok' | 'warnings' | 'blocked';
  issues: MenuIssue[];
  suggestions: string[];
  analyzedAt: number;
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
