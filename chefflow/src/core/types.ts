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
  // Allergen tags the chef manually flagged on this ingredient. ChefFlow no
  // longer auto-detects allergens (the LLM + regex paths were removed for
  // legal-risk reasons under FIR 2014). undefined / [] both mean "the chef
  // has not flagged any allergens on this row"; [tag...] is the user's
  // explicit declaration.
  allergenFlags?: AllergenTag[];
  // Set when this ingredient line references another recipe (entered as `#` in
  // the editor and picked from the autocomplete). `name` holds the display
  // label (e.g. "(Demo) Black Pepper Sauce"); amount + unit work normally.
  // The scaler does NOT multiply this ingredient's amount when the parent
  // scales — the literal quantity is honored. The scheduler expands the
  // referenced recipe's steps into the parent's timeline.
  componentRecipeId?: string;
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
  // Set by flattenSubRecipes() when a step came from a referenced
  // (component) recipe. UI uses this to render a "from #<sub-recipe>"
  // badge on merged steps. Original (parent-recipe) steps leave it unset.
  sourceRecipeId?: string;
  /** Display title of the source recipe (so the UI can show a breadcrumb
   *  like "Ribeye > Black Pepper Sauce" without a separate id→title lookup). */
  sourceRecipeTitle?: string;
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
  /** @deprecated since 2026-05-27 — moved to top-level Recipe.allergens
   *  for the same reason; legacy reads use `getRecipeAllergenList()` from
   *  `core/recipes/recipeShape.ts`. Legacy rows promote on save. The
   *  `keyIngredientTags` field that lived here was removed entirely on
   *  2026-05-28 — the feature was scrapped (chef-declared allergens are
   *  the only safety-relevant tag). */
  allergens?: AllergenTag[];
  analyzedAt?: number;              // epoch ms
  source?: 'llm-text' | 'llm-vision' | 'manual';
}

/**
 * Sync-metadata mixin — shared across every Dexie store that participates in
 * D1 cloud sync (Recipe, KitchenEvent, Menu, AllergenAuditEntry).
 *
 *   userId    — Clerk subject (or `anon:<random>` pre-sign-in). Filter for
 *               every read; stamped on every write so cross-user reads in
 *               a shared browser can't see each other's rows.
 *   isDeleted — soft-delete tombstone. Listings filter it; the row stays
 *               locally so a stale server pull can't resurrect it.
 *   synced    — push-queue flag. Writes set this false; the sync engine
 *               flips it true once the server confirms an LWW-applied
 *               status. `undefined` is treated the same as `false`.
 */
export interface SyncMeta {
  userId?: string;
  isDeleted?: boolean;
  synced?: boolean;
  /** Team-share read-only marker (T3c Phase 3). Set on rows the caller
   *  pulled from an Enterprise team owner they're an accepted viewer
   *  of. The SPA renders these with a "Shared by" badge and hides edit
   *  / share / delete affordances; the sync engine filters them out of
   *  push so the viewer never writes back over the owner's content. */
  ownerUserId?: string;
  /** True when the row is shared FROM another user; pairs with
   *  ownerUserId. Kept as a separate boolean so future "shared with
   *  edit" roles can flip it false without losing provenance. */
  readOnly?: boolean;
  /** T4 — owner-side list of group_ids this row is shared with. Empty
   *  array (or undefined) = private to the owner; the sync layer will
   *  not fan it out to any member. Owner toggles ticks per group in
   *  the editor. Foreign to members' world: they only ever see rows
   *  that satisfy the filter, so members' local copies don't need
   *  this field (worker projects them with readOnly + ownerUserId). */
  sharedWithGroupIds?: string[];
  /** T6 — id of the team that satisfied the per-row sharedWithGroup
   *  Ids filter for THIS viewer. Only set on member-pulled rows;
   *  the SPA renders the team-name tag and powers the per-team chip
   *  filter from this field. */
  teamId?: string;
  /** T6 — the matched team's display name as the owner chose it.
   *  Server-side lookup at pull time saves the member a separate
   *  fetch to resolve names. */
  teamName?: string;
}

export interface Recipe extends SyncMeta {
  id: string;
  title: string;
  /** Optional freeform description shown under the title in the editor.
   *  Not yet surfaced on cards/library — editor-only for now. */
  description?: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  /** Chef-declared UK Top-14 allergen tags. Top-level (NOT under `analysis`)
   *  so the data model itself signals "chef-declared, not AI-generated".
   *  Post-2026-05-28: this field is effectively a per-recipe AGGREGATION
   *  of the union of every `Ingredient.allergenFlags` — the chef adds
   *  allergens at the INGREDIENT row (with the 5-second cooldown gate)
   *  and the recipe-level UI reads from this aggregation. Direct
   *  recipe-level adds were removed to push allergen verification into
   *  the per-ingredient flow where the supplier label is closest at hand. */
  allergens?: AllergenTag[];
  /** Chef-declared free-form labels — cuisine, occasion, dietary
   *  preference names ("vegan", "gluten-free option"), prep style, etc.
   *  NOT safety-relevant — these never imply allergen claims. Allergens
   *  live ingredient-by-ingredient on `Ingredient.allergenFlags`. */
  otherTags?: string[];
  analysis?: RecipeAnalysis;
  // Cost per portion in GBP. Optional — older recipes leave this undefined and
  // the event-total math treats them as zero. UI formats with formatGBP().
  pricePerPortion?: number;
  /** Base64 JPEG data URL, downscaled to <=1600px. Stored in Dexie. */
  coverPhoto?: string;
  /** The community recipe id this row was copied from (e.g. `cr_xyz`). Set
   *  when the user uses "Copy to my library" on a community card. Powers
   *  auto-uncopy on local soft-delete: deleting a recipe with this field
   *  set fires POST /community/:id/uncopy to rewind the global counter. */
  copiedFromCommunityId?: string;
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

export interface KitchenEvent extends SyncMeta {
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
  /** The original unparsed text (e.g. a customer email) the chef pasted into
   *  GenerateEventSheet. Set ONLY when the event came from an LLM-extraction
   *  flow; undefined for manually-typed events. The EventView notes hover
   *  popover renders this in full + highlights which lines produced each
   *  bullet, so the chef can confirm a note really came from the customer
   *  rather than being synthesized by the LLM. Not synced to D1 today (would
   *  bloat the payload for a feature only used during local editing) — when
   *  needed, plumb through community.ts publishRecipe / sync.ts push paths. */
  notesOriginal?: string;
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

export interface Menu extends SyncMeta {
  id: string;
  title: string;
  description?: string;
  recipeIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type MenuSuggestionCategory = 'allergy' | 'budget' | 'other';

export interface MenuSuggestion {
  category: MenuSuggestionCategory;
  text: string;
}

export interface MenuAnalysis {
  // 'ok' — no issues. 'warnings' — soft conflicts (e.g. limited vegan options).
  // 'blocked' — at least one guest can't eat anything safely.
  verdict: 'ok' | 'warnings' | 'blocked';
  issues: MenuIssue[];
  /**
   * Exactly 5 actionable suggestions, each tagged by category so the UI
   * can render a badge. The LLM is instructed to cover allergies, budget,
   * and general improvements. Order is preserved as returned. Parser pads
   * with neutral 'other' entries if the LLM returns fewer than 5; slices
   * if it returns more.
   */
  suggestions: MenuSuggestion[];
  analyzedAt: number;
}

export type ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

// Closed set of reasons a chef can pick when removing an allergen tag. Used by
// the safe-removal modal + the local audit log.
export type AllergenRemovalReason =
  | 'ingredient-changed'
  | 'recipe-changed'
  | 'mistakenly-added'
  | 'other';

/**
 * One audit row per allergen-tag removal. Persisted in Dexie's `allergenAudits`
 * table. We snapshot `recipeTitleAtTime` + `ingredientsAtTime` so the history
 * stays readable even if the recipe is later renamed or edited. Multiple
 * reasons allowed (e.g. ingredient-changed + mistakenly-added co-apply).
 */
export interface AllergenAuditEntry extends SyncMeta {
  id: string;
  recipeId: string;
  recipeTitleAtTime: string;
  removedTag: AllergenTag;
  reasons: AllergenRemovalReason[];
  otherText?: string;
  ingredientsAtTime: string[];
  removedAt: number;
  /** Historical Clerk-id field, preserved for the legacy bespoke audit
   *  endpoint (`/audit/allergen-removal`). The canonical sync-owner field
   *  is `SyncMeta.userId`; for new audits both are set to the same value. */
  userClerkId?: string;
  /** Display name at the time of removal, snapshotted so renames don't
   *  rewrite history. Falls back to "(anonymous)" in the history view. */
  userDisplayName?: string;
}

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
