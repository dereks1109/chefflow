# ChefFlow MVP — Design Spec

**Date:** 2026-05-13
**Status:** Draft, pending user review

## Goal

Build a mobile-first web app for professional chefs that:
1. Lets them create, edit, and share recipes (1 portion = 1 person).
2. Lets them create events with multiple portions of food and free-form notes for special needs.
3. Transforms event recipes into a single interactive, scrollable kitchen workflow that the chef can scroll freely up/down, with the schedule built from the six culinary workflow rules in `CulinaryRule.md`.

## Scope Decisions

- **MVP includes all three features** end-to-end, each minimal but usable.
- **No accounts.** Recipes are stored locally (IndexedDB) and shared via URL-hash links — no backend.
- **Workflow UI is a vertical scrolling step list** (mobile-first), not a horizontal scrubber or Gantt.
- **Multi-dish workflows are merged into a single interleaved timeline** for the cook session.

## Tech Stack (per `CLAUDE.md`)

- Vite + React + TypeScript
- Tailwind CSS (with true-black mode for kitchen lighting)
- Zustand (global UI state: unit system, kitchen mode)
- Dexie.js (IndexedDB persistence)
- `react-markdown` for rendering recipe markdown
- `decimal.js` for precision unit math
- `lz-string` for share-URL compression
- `vite-plugin-pwa` for offline kitchen use
- Vitest for unit tests

Static-hosted (Netlify / Vercel / GH Pages); no backend.

## 1. Architecture

Three top-level routes:
- `/recipes` — library, create/edit/import/export, open share links.
- `/events` — event list, create event.
- `/events/:id/cook` — kitchen mode: the merged scrollable workflow.

Layered modules (UI-free core, thin UI):
- `core/parser` — Markdown ↔ structured Recipe.
- `core/units` — pure conversion + normalization.
- `core/scaler` — portion scaling + locked-ingredient rules.
- `core/scheduler` — encodes all six rules from `CulinaryRule.md` to merge N scaled recipes into one ordered timeline.
- `core/share` — URL-hash encode/decode with LZ compression.
- `db/` — Dexie tables: `recipes`, `events`.
- `state/` — Zustand stores: `unitSystemStore`, `kitchenModeStore`.
- `ui/` — pages and components.

The hard math (parsing, scaling, scheduling) lives in `core/` with unit tests; React components stay thin and consume those modules.

## 2. Data Model

### Recipe

```ts
interface Recipe {
  id: string;              // UUID
  title: string;
  originalYield: number;   // portions = people; recorded for reference
  prepTime?: string;       // "30m"
  cookTime?: string;       // "2h"
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

interface Ingredient {
  id: string;
  raw: string;             // "{800|g|Beef Chuck}"
  amount: number;
  unit: string;
  name: string;
  isLocked: boolean;       // don't scale (e.g. salt, baking powder)
}

interface WorkflowStep {
  id: string;
  text: string;            // markdown body, may contain <Timer duration="600s">
  durationSec?: number;    // parsed from <Timer>
  kind: 'active' | 'passive'; // chef-busy vs. simmer/rest/bake
  equipment?: string[];    // e.g. ["oven@180C", "stovetop", "wok"]
  thermalClass: 'flash' | 'stable' | 'normal'; // Rules 2 & 3
  allergenClass: 'allergen-free' | 'allergen'; // Rule 5
  dependsOn: string[];     // step ids in same recipe (Rule 6)
  batchKey?: string;       // e.g. "chop:onion" — cross-recipe batching (Rule 4)
  panCapacityPortions?: number; // split when exceeded (Rule 4)
  phase: 'prep' | 'cook' | 'serve'; // default 'cook'; chef re-tags prep/serve steps
}
```

### Event

```ts
interface Event {
  id: string;
  title: string;
  serveAt?: string;        // ISO datetime — anchor for Rule 1 reverse timeline
  notes: string;           // event-level: allergies, special needs
  dishes: EventDish[];
  createdAt: number;
  updatedAt: number;
}

interface EventDish {
  recipeId: string;
  recipeSnapshot: Recipe;  // frozen copy at add-time — editing recipe later won't mutate event
  portions: number;        // target portions for this dish
  perDishNotes?: string;   // e.g. "3 portions vegetarian"
}
```

### ScheduledStep (scheduler output)

```ts
interface ScheduledStep {
  stepId: string;
  recipeId: string;
  dishLabel: string;       // human display + color
  text: string;
  durationSec?: number;
  startAt: Date;
  endAt: Date;
  phase: 'prep' | 'sanitize' | 'cook' | 'serve';
  dependsOnStepIds: string[];
  warnings: string[];
}
```

**Design calls:**
- **Snapshot recipes into events** at add-time so editing a recipe later doesn't silently mutate a planned event.
- **Notes in two places:** event-level (`Event.notes`) for cross-cutting info, and per-dish (`EventDish.perDishNotes`) for dish-specific. No per-portion entity in MVP.

## 3. Recipe Editor

`/recipes/:id/edit` — dual-pane:

- **Left pane (structured form):**
  - Title, yield, prep/cook time inputs.
  - Ingredient rows: amount (accepts `1/2`, `1.5`) + unit dropdown (grouped weight/volume/temp) + name + 🔒 lock toggle.
  - Step rows: markdown text, "Add timer" button (wraps selection in `<Timer duration="...">`), kind toggle (Active/Passive), equipment tag chips with autocomplete, thermal class chip (flash/stable/normal), allergen toggle, "depends on" multi-select picker (earlier steps), optional batch-key, optional pan-capacity.
- **Right pane:** live markdown preview via `react-markdown`.
- **"View raw markdown" toggle** for source editing; round-trips cleanly form ↔ markdown.

Sensible defaults: kind=Active, thermal=normal, allergen=allergen-free, phase=cook, no deps, no batch key. Most steps need no extra tagging.

`/recipes` library: card grid (title, yield, time chips, last-edited), with Create / Import .md / Open share link. Per-card menu: Edit, Duplicate, Export .md, Share, Delete. Title text search only — no categories/tags in MVP.

## 4. Event Creation & Editing

`/events/new` and `/events/:id` use a single-page form (mobile-first):

1. Header: title, serve-at datetime, event-level notes textarea.
2. Dishes section with "Add dish" → recipe picker (search by title); each added dish shows:
   - Recipe title (snapshot, read-only).
   - Portions number input.
   - Per-dish notes textarea.
   - Live-scaled summary line (e.g. "Beef Chuck: 800g → 9.6kg").
   - Remove button.
3. Save persists to IndexedDB.

Top-of-page actions on event detail:
- 🍳 **Start cooking** → `/events/:id/cook` (Section 5).
- 🛒 **Grocery list** → derived view summing scaled ingredients across dishes, grouped by name, units normalized.

Conflict hints: if two dishes need the same equipment at incompatible states, show a non-blocking warning chip near the dish list.

**Trimmed for MVP:** no guest list, no per-portion identities, no calendar drag-drop, no recurring events.

## 5. Scheduler (CulinaryRule.md as Spec)

The scheduler is not a vague heuristic — each of the six rules maps to a concrete pass.

**Inputs:** `serveAt` + array of `EventDish` (each with scaled recipe steps).
**Output:** ordered `ScheduledStep[]` with phase, dependencies, and warnings.

**Algorithm:**

1. **Rule 1 — Reverse timeline.** For each dish, anchor the final step at `serveAt`; walk backwards subtracting durations to compute each step's `startAt` / `endAt`. Passive steps occupy time but free the chef; active steps occupy chef-busy time.
2. **Rule 2 — Thermal stability.** Push stable-class dishes (soups, braises) as early as their constraints allow; their final step is a `hold` instruction (e.g. "cover stockpot on low warmer").
3. **Rule 3 — Last-minute flash.** Flash-class steps are *pinned* — `endAt = serveAt` — and never moved. Their mise en place (any prep marked as their dependency) must complete before the flash step's `startAt`; a hard warning fires if violated.
4. **Rule 4 — Batching.** Pre-pass: group prep steps across recipes by `batchKey` (e.g. "chop:onion") into one merged batched-prep step in the prep phase. Pan-capacity check: if effective portions exceed `panCapacityPortions`, split into N sequential sub-steps with a warning.
5. **Rule 5 — Safety & allergy isolation.** Steps are grouped by their `phase` field. Within the prep phase, sort allergen-free steps before allergen steps. Insert a fixed 5-minute `sanitize-window` scheduled step between the last prep step and the first cook step (only if at least one prep step exists).
6. **Rule 6 — Multi-component dependencies.** Build a DAG from `dependsOn`. Topological sort within each scheduling slot. A step is not eligible to start until all its deps are checked complete.

**Equipment conflict pass** runs after rules: overlapping steps with the same `equipment` tag → warning chip (non-blocking).

## 6. Kitchen Mode (`/events/:id/cook`)

Vertical scrolling step list, mobile-first, big touch targets (≥ 44×44 px per CLAUDE.md).

- **Sticky header:** event title, countdown to `serveAt`, global timers strip showing every running timer across dishes.
- **Step card** (one per `ScheduledStep`):
  - Time chip ("-2:15 before serve" or "Now").
  - Dish color chip (each dish gets a consistent color).
  - Step markdown body.
  - Inline `<Timer>` button — tap to start; running timers join the sticky strip; audio alert on completion via Web Audio API.
  - Phase + active/passive icon + equipment tags.
  - Checkbox-style **Done** affordance.
- **Current-step indicator:** the topmost unchecked step **whose dependencies are all complete** is "current" — highlighted band, scrolls into view. Steps with unmet deps render greyed-out with a "Waiting on: <dep label>" hint (Rule 6 enforcement at the UI layer).
- Chef can scroll freely above (already-done) and below (preview upcoming).
- **Wake lock on** (Web Wake Lock API), **true-black background option**, **TTS read-aloud** button for the current step.

## 7. Sharing

**Recipes only** (events are personal plans tied to a serve-time).

- Click Share → URL like `https://chefflow.app/#r=<payload>` where `<payload> = base64url(LZString.compressToEncodedURIComponent(recipeMarkdown))`.
- Markdown is the source of truth; the share blob is just the `.md` bytes.
- Recipient: app detects `#r=` on load → decodes → opens an Import Preview screen (rendered recipe + Save to library / Discard buttons). Hash is cleared after action.

**Edge cases:**
- Decode fails → friendly "malformed or corrupted" screen.
- Title collision on import → Rename / Replace / Cancel dialog.
- URL exceeds browser limit → "too large to share via link; export .md instead" with the export button.

**Other transports** (carry identical markdown):
- Export `.md` file download.
- Import `.md` file picker.
- Copy markdown to clipboard.

## 8. File / Folder Structure

```
chefflow/                  # new Vite app root
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/                    # UI-free, pure TS, unit-tested
│   │   ├── parser/
│   │   │   ├── parseRecipe.ts
│   │   │   ├── serializeRecipe.ts
│   │   │   └── parseRecipe.test.ts
│   │   ├── units/
│   │   │   ├── convert.ts
│   │   │   ├── normalize.ts
│   │   │   └── units.test.ts
│   │   ├── scaler/
│   │   │   ├── scaleRecipe.ts
│   │   │   └── scaler.test.ts
│   │   ├── scheduler/
│   │   │   ├── reverseTimeline.ts        # Rule 1
│   │   │   ├── thermalSort.ts            # Rules 2 & 3
│   │   │   ├── batchPrep.ts              # Rule 4
│   │   │   ├── allergenSort.ts           # Rule 5
│   │   │   ├── dependencyGraph.ts        # Rule 6
│   │   │   ├── equipmentConflicts.ts
│   │   │   ├── buildSchedule.ts          # orchestrates passes
│   │   │   └── scheduler.test.ts
│   │   ├── share/
│   │   │   ├── encodeShareUrl.ts
│   │   │   ├── decodeShareUrl.ts
│   │   │   └── share.test.ts
│   │   └── types.ts
│   ├── db/
│   │   ├── dexie.ts
│   │   ├── recipesRepo.ts
│   │   └── eventsRepo.ts
│   ├── state/
│   │   ├── unitSystemStore.ts
│   │   └── kitchenModeStore.ts
│   ├── ui/
│   │   ├── pages/
│   │   │   ├── RecipesLibrary.tsx
│   │   │   ├── RecipeEditor.tsx
│   │   │   ├── RecipeImportPreview.tsx
│   │   │   ├── EventsLibrary.tsx
│   │   │   ├── EventEditor.tsx
│   │   │   └── KitchenMode.tsx
│   │   ├── components/
│   │   │   ├── IngredientRow.tsx
│   │   │   ├── StepRow.tsx
│   │   │   ├── TimerButton.tsx
│   │   │   ├── GlobalTimerBar.tsx
│   │   │   ├── ScheduledStepCard.tsx
│   │   │   ├── UnitSystemToggle.tsx
│   │   │   ├── DishPickerModal.tsx
│   │   │   └── GroceryList.tsx
│   │   └── theme/
│   │       └── tailwind.css
│   └── pwa/
│       └── (manifest + service worker config via vite-plugin-pwa)
└── tests/
    └── fixtures/                 # hand-checked event scenarios from CulinaryRule.md
```

`core/` files never import React, Dexie, or Zustand. `db/` and `state/` depend on `core/types.ts` only. Files growing past ~200 lines are a smell to revisit.

## 9. Testing Strategy

- **Vitest unit tests** for every `core/` module — TDD-friendly, no React.
- **Scheduler fixture scenarios** in `tests/fixtures/`: hand-checked event timelines (e.g. "Dinner for 12 with stew + roast + flash-seared scallop") asserting the algorithm matches what a human chef would plan.
- **React Testing Library** for editor and kitchen-mode component tests.
- **Smoke E2E (Playwright)** post-MVP: create recipe → add to event → enter kitchen mode → check off steps → finish.

## 10. Out of Scope (MVP)

- Accounts / cloud sync.
- Calendar / drag-drop scheduling across multiple events.
- Persistent grocery inventory tracking (only on-demand list generation).
- Real-time multi-chef collaboration.
- Voice command *input* (TTS *output* is in).
- Native mobile apps (PWA covers it).

## 11. Open Items (User Flagged "Fix Later")

- Polish pass on out-of-scope list — to revisit after MVP is running.
