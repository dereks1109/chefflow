# ChefFlow Plan 3 — Workflow Scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a single coherent step-by-step kitchen timeline from a `KitchenEvent`'s dishes plus the heuristics in `CulinaryRule.md`. Expose it as a typed pure function that the SPA renders at `/events/:id/workflow` (with up/down reorder + color tags + per-color task lists) and that a local **MCP server** wraps as a tool for other LLMs (Claude Desktop, Cursor, etc.).

**Architecture:** `core/scheduler/scheduleEvent.ts` is the pure-function source of truth. The browser SPA calls it directly. A separate `chefflow-mcp/` Node package imports it and serves it via `@modelcontextprotocol/sdk` as one tool: `generate_workflow`. The output (`ScheduledStep[]`) persists on the event as a saved snapshot (`event.workflow`) so user edits aren't lost.

**Tech Stack additions:**
- Browser side: nothing new (uses existing types, react-router, Dexie).
- MCP package: `@modelcontextprotocol/sdk` (Node ESM).
- No drag-drop library — reorder is up/down arrows, matching the dish reorder we shipped in `51fb407`.

**Spec reference:** `CulinaryRule.md` rules 1–6 and `core/types.ts` (existing `WorkflowStep` metadata: `phase`, `kind`, `thermalClass`, `allergenClass`, `dependsOn`, `batchKey`, `panCapacityPortions`, `durationSec` — all already in place from Plan 1).

---

## UX Decisions Locked Here

- **Where it lives:** A new route `/events/:id/workflow`, reached via a "Generate workflow" button on the `EventView` page. The existing dish timeline on the event view stays as the simple overview.
- **Generation trigger:** Algorithm runs on entering the workflow page if `event.workflow` is missing or stale (dishes hash changed). User can also click **Regenerate** explicitly. **Save** persists the current in-memory state to Dexie.
- **Reorder UX:** Up/down arrows on each step (same pattern as `DishRow` in reorder mode). A "Reorder" toggle on the workflow header enables them.
- **Color model:** A fixed 6-color palette — **red / orange / yellow / green / blue / purple**. Each step has an optional `colorTag`. Clicking the color circle on a step opens a popover swatch picker (or "clear"). No chef-entity table; the user mentally maps colors to people.
- **Per-color task list:** A filter strip at the top of the workflow page. Click a color chip → list filters to steps tagged that color. A "Print this list" button on the filtered view produces a print-friendly handout (single page, large fonts, no chrome).
- **Persistence model:** When user reorders or recolors, those edits are kept in component state. **Save** writes `event.workflow = ScheduledStep[]` (the current ordered+tagged snapshot). **Regenerate** discards saved state and re-runs the algorithm from scratch. If dishes change after a workflow was saved, the workflow page shows a "Stale — dishes changed since this workflow was saved" banner with a one-click Regenerate.
- **MCP target:** Stdio-transport local server, one tool only. User configures it once in their LLM client (Claude Desktop / Cursor / etc.) by adding a JSON entry pointing to `node chefflow-mcp/dist/server.js`.

---

## File Structure (Plan 3 Creates / Modifies)

```
docs/superpowers/plans/
└── 2026-05-14-chefflow-plan-3-workflow-scheduler.md   # this file (NEW)

chefflow/
├── src/
│   ├── core/
│   │   ├── types.ts                         # MODIFY: extend ScheduledStep + KitchenEvent.workflow
│   │   └── scheduler/
│   │       ├── scheduleEvent.ts             # NEW: pure-function entry point
│   │       ├── scheduleEvent.test.ts        # NEW
│   │       ├── duration.ts                  # NEW: estimate step durations
│   │       ├── duration.test.ts             # NEW
│   │       ├── rules.ts                     # NEW: small per-rule helpers
│   │       └── rules.test.ts                # NEW
│   ├── db/
│   │   └── dexie.ts                         # MODIFY: v4 — no schema change, just type bump
│   └── ui/
│       ├── pages/
│       │   ├── EventWorkflow.tsx            # NEW: workflow page
│       │   ├── EventWorkflow.test.tsx       # NEW
│       │   ├── EventView.tsx                # MODIFY: add "Generate workflow" link
│       │   └── ColorTaskListPrint.tsx       # NEW: print layout
│       └── components/
│           ├── WorkflowStepRow.tsx          # NEW: single step row (display + edit modes)
│           ├── ColorPicker.tsx              # NEW: small swatch popover
│           ├── ColorFilterBar.tsx           # NEW: top of workflow page
│           └── TimelineRail.tsx             # NEW: left-side clock-time rail
│
chefflow-mcp/                                # NEW: separate Node package
├── package.json                             # NEW
├── tsconfig.json                            # NEW
├── README.md                                # NEW: install + Claude Desktop config snippet
└── src/
    ├── server.ts                            # NEW: MCP stdio server
    └── server.test.ts                       # NEW: smoke test the tool round-trip
```

---

## Data Model Additions

### `core/types.ts` — extend `ScheduledStep` + add `workflow` to `KitchenEvent`

```ts
// Replaces the existing ScheduledStep with a JSON-friendly shape (strings, not Date).
export type ColorTag = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface ScheduledStep {
  // identity
  id: string;             // unique per scheduled step (synthesized: `${dishId}:${recipeStepId}`)
  dishId: string;
  recipeId: string;
  recipeStepId: string;

  // display
  dishLabel: string;      // dish.name as shown in the event
  text: string;           // recipe step text (may include <Timer …>)

  // timing
  startAt: string;        // ISO datetime — when this step starts in clock time
  endAt: string;          // ISO datetime
  durationSec: number;    // resolved duration (from recipe or heuristic)

  // metadata pulled forward from WorkflowStep (denormalized for the LLM tool)
  phase: 'prep' | 'cook' | 'serve' | 'sanitize';
  kind: 'active' | 'passive';
  thermalClass: 'flash' | 'stable' | 'normal';
  allergenClass: 'allergen-free' | 'allergen';
  dependsOnStepIds: string[];   // ScheduledStep.id values

  // user-editable overlay
  colorTag?: ColorTag;
  manualOrderHint?: number;     // when set, the user has manually positioned this step;
                                 // regeneration honors this until the user clears it

  // diagnostics
  warnings: string[];           // e.g. "duration estimated", "depends on out-of-order step"
  rulesApplied: number[];       // [1, 3] — which CulinaryRule.md rules drove this placement
}

export interface KitchenEvent {
  // ...existing fields...
  workflow?: ScheduledStep[];           // saved snapshot — present when user has saved
  workflowGeneratedFromDishesHash?: string;  // SHA-1 of dishes for staleness detection
}
```

A small Dexie version bump (v4) accompanies — no schema change to indexed fields, just to invalidate any rows where the type shape would now mismatch.

---

## Algorithm Sketch — `scheduleEvent.ts`

```ts
interface ScheduleInput {
  event: KitchenEvent;
  recipes: Map<string, Recipe>;  // keyed by recipe.id; only the ids referenced by event.dishes need be present
}

interface ScheduleOptions {
  defaultPrepDurationSec?: number;   // fallback when a prep step has no durationSec (e.g. 180)
  defaultCookDurationSec?: number;   // fallback for cook (e.g. 300)
  defaultServeDurationSec?: number;  // fallback for serve (e.g. 60)
  sanitizeBreakSec?: number;         // injected between allergen-free → allergen blocks (default 300, Rule 5)
}

export function scheduleEvent(input: ScheduleInput, opts?: ScheduleOptions): ScheduledStep[]
```

### Pseudo-algorithm

```
1. Collect: for each dish in event.dishes:
   - Look up recipe by dish.recipeId (skip dish if isPrepared || no recipe)
   - For each WorkflowStep in recipe.steps:
       create a ScheduledStep stub with:
         id = `${dish.id}:${step.id}`
         dishId = dish.id
         dishLabel = dish.name
         durationSec = step.durationSec ?? estimateDuration(step.kind, step.phase, opts)
         dependsOnStepIds = step.dependsOn.map(s => `${dish.id}:${s}`)
         (carry phase/kind/thermal/allergen forward)
   - If dish.isPrepared: emit a single "Pick up / prepare {name}" step at phase='prep'
     anchored to dish.startAt; allergen-free by default

2. Anchor:
   - eventServeAt = event.serveAt (if undefined: latest dish.startAt; if no dishes: now+24h)
   - Each dish has dish.startAt — that's a soft anchor for its serve-phase steps

3. Reverse-schedule per dish:
   For each dish (independently):
     - serve-phase steps end at dish.startAt + 0..durationSec window before serve
     - cook-phase steps end immediately before the dish's serve-phase steps
     - prep-phase steps end before cook
     - Within each phase, sort topologically by dependsOnStepIds
     - flash thermalClass anchors to LAST possible slot   [Rule 3]
     - stable thermalClass anchors to EARLIEST possible slot   [Rule 2]
     - normal slots between them

4. Merge across dishes:
   - Concatenate all dish schedules
   - Apply Rule 5 (safety/allergen isolation):
       - Group steps into allergen-free and allergen blocks
       - When moving from a free block to an allergen block, insert a sanitize step
         (phase='sanitize', durationSec=opts.sanitizeBreakSec, allergen-free, text="Sanitize boards/knives")
   - Apply Rule 4 (batching):
       - Steps with identical batchKey across dishes are consolidated:
         pick the earliest one's slot, mark others as "batched with #X"

5. Conflict resolution:
   - If two steps overlap on a shared resource (pan, oven), assume infinite parallelism for v1
     and emit a warning ("two ovens needed at HH:MM")
   - If a dependency lands after its dependant, swap and warn

6. Tag each step with rulesApplied: [...] based on which heuristic moved it

7. Apply user overlay (if regenerating with prior state):
   - For any ScheduledStep with manualOrderHint, keep its relative position
   - Recompute clock times from the new ordering using the chain of durations
```

### Edge cases & defaults

- **No serveAt anywhere:** fall back to `Date.now() + 24h` and emit a top-level warning.
- **Recipe step with no duration AND no phase/kind:** apply `defaultPrepDurationSec` and warn.
- **Circular `dependsOn`:** detect, emit warning, fall back to topological order with the cycle broken at the lowest-`dependsOn`-count node.
- **Same `batchKey` in dishes with very different start times:** batch is only valid if the time windows overlap; otherwise treat as separate, with a "batchable" hint in warnings.

---

## Task Breakdown

The whole plan is divided into **five tasks (A–E)**. Each one ships as its own commit. A–C are the must-haves; D–E unlock the API/LLM story.

### Task A — Core scheduler (TDD, no UI) — must-have
- [ ] Write `duration.ts` + tests for the heuristic (returns ms for a `WorkflowStep` given `kind`, `phase`, and `opts`)
- [ ] Write `rules.ts` + tests: `isFlash`, `isStable`, `isAllergen`, `batchKey`, `topologicalSort`
- [ ] Write `scheduleEvent.ts` covering single-dish, two-dish, dependency, allergen-mixed, batched cases
- [ ] Add at least one fixture: `__fixtures__/demoEvent.ts` reproducing the Demo Event from the seed
- [ ] Assert against the timeline I hand-wrote in chat (17:30 prep start, 17:48 heat skillet, 17:55 rest, 17:58 toss, 18:00 serve)
- [ ] Commit: `feat(scheduler): rule-driven workflow scheduler core`

### Task B — Workflow page (read-only render) — must-have
- [ ] Extend `KitchenEvent` type and Dexie v4 type bump
- [ ] New route `/events/:id/workflow`
- [ ] `EventWorkflow.tsx` reads event + linked recipes, calls `scheduleEvent`, renders the result
- [ ] `WorkflowStepRow.tsx`: time on left rail, dish label chip, step text, rule tags as small pills
- [ ] Add "Generate workflow" button on `EventView` header pointing to the new route
- [ ] Smoke test: workflow page shows the Demo Event's steps with computed clock times
- [ ] Commit: `feat(ui): /events/:id/workflow page rendering the scheduler output`

### Task C — Reorder + color tags + persistence — must-have
- [ ] Reorder toggle (mirrors `DishRow` reorder mode): up/down arrows replace edit/color buttons during reorder
- [ ] `ColorPicker.tsx`: 6-swatch popover anchored on a color-circle button per row
- [ ] `ColorFilterBar.tsx`: chips for each color, click filters the workflow list; "All" resets
- [ ] **Save** button writes `event.workflow = currentScheduledSteps`; **Regenerate** discards
- [ ] Stale-banner: when `event.workflow` exists but the dishes-hash differs, show "Dishes changed — Regenerate"
- [ ] Tests for save / regenerate / filter / reorder
- [ ] Commit: `feat(ui): workflow reorder + color tags + saved snapshot`

### Task D — Per-color task lists + print — nice-to-have, ships independently
- [ ] Filter view: when a color filter is active, hide the time rail's grayed-out steps so the list reads cleanly
- [ ] **Print this list** button → opens a print-friendly route `/events/:id/workflow/print/:color` rendered with `@media print` rules (no header, large fonts, time + step text only)
- [ ] Tests: filter shows only matching steps; print route renders the expected subset
- [ ] Commit: `feat(ui): per-color task lists + print view`

### Task E — MCP server (separate package) — API surface for other LLMs
- [ ] Create `chefflow-mcp/` with its own `package.json` (Node ESM, type module, target Node 20+)
- [ ] Add `@modelcontextprotocol/sdk` + `tsx` for dev
- [ ] `src/server.ts`: stdio-transport server exposing one tool
  ```ts
  tool: generate_workflow
  input: { event: KitchenEvent, recipes: Recipe[], options?: ScheduleOptions }
  output: { steps: ScheduledStep[], warnings: string[] }
  ```
- [ ] The server imports `scheduleEvent` from the chefflow package (via a `file:` workspace dep or by symlinking the built JS — TBD when implementing)
- [ ] Smoke test: a Node script that pipes a JSON event into the stdio server and asserts the steps come back
- [ ] `README.md` showing the JSON snippet for Claude Desktop's `~/Library/Application Support/Claude/claude_desktop_config.json`:
  ```json
  {
    "mcpServers": {
      "chefflow": {
        "command": "node",
        "args": ["/Users/derekshek/vs code/chefflow-mcp/dist/server.js"]
      }
    }
  }
  ```
- [ ] Commit: `feat(mcp): chefflow MCP server exposing generate_workflow`

### Task F — Final verification — same shape as Plan 2a Task 9
- [ ] `npx tsc --noEmit` (clean)
- [ ] `npm run test:run` (count tests; target ~130 after Task C, ~140 after Task E)
- [ ] `npm run build` (clean prod build of the SPA)
- [ ] In `chefflow-mcp`, `npx tsc --noEmit` + at least one smoke test
- [ ] Manual smoke against the Demo Event:
  1. Open `/events/e_demo_main/workflow` → workflow renders with computed clock times
  2. Drag steps around with ↑/↓; tag some red, some blue
  3. Click **Save** → reload page → state persists
  4. Click red chip in the filter bar → only red steps remain
  5. Click "Print" → print preview shows the red subset cleanly
  6. From a separate LLM client configured with the MCP, run the tool against the Demo Event JSON → output matches what the SPA shows
- [ ] No commit needed (verification only)

---

## Plan 3 Done — What You Have

- An event's dishes can be combined into a single rule-driven kitchen workflow with computed clock times
- The workflow is reorderable and color-taggable per step
- Per-color task lists can be filtered and printed
- A standalone MCP server exposes the same algorithm to other LLMs

## What's Next (Plan 4+)

Likely follow-ups, in rough order:
- **Recipe sharing / export-import** (the originally-planned 2b)
- **Chef entities** (label colors with names, persist across events)
- **Resource awareness** (pan, oven, hob → schedule respects capacity, no more "infinite parallelism" warnings)
- **Live cooking mode** at `/events/:id/cook` — the existing `KitchenPlaceholder` becomes the on-station view that ticks through the saved workflow with timers
