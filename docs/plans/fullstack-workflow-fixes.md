# Fullstack workflow fixes

Three small, independent fixes. Each section is self-contained.

---

## (a) LLM JSON parse — migrate remaining call sites to `stripMarkdownFences`

### Audit (what's already done)

- `chefflow/src/core/llm/stripMarkdownFences.ts` exists as the shared util (commit `626c471`).
- `chefflow/src/core/scheduler/llm/llmScheduler.ts:65` already uses it.
- `chefflow/src/core/recipes/llm/recipeGen.ts:113,163` already use it (two call sites).
- `chefflow/src/core/events/llm/eventGen.ts:59,124` — **still uses local `stripWrapper`**.
- `chefflow/src/core/events/llm/menuCheck.ts:100,120` — **still uses local `stripWrapper`**.
- `chefflow/src/core/events/reviewDraft.ts:44` is `JSON.parse` over localStorage, not LLM output — out of scope.

Both surviving `stripWrapper` bodies are byte-identical to `stripMarkdownFences`, so this is a pure de-duplication, not a behavior change. The shipped bug fix in `626c471` only covered the scheduler path; the user's symptom is reproducible from `menuCheck` or `eventGen` if Groq returns fences on those endpoints.

### Approach

In each file: drop the local `stripWrapper` declaration; import `stripMarkdownFences` from `../../llm/stripMarkdownFences`; replace the one call site. Keep the surrounding `JSON.parse` + error-wrapping (`EventGenError` / `MenuCheckError`) untouched — the error classes are part of those modules' public contracts.

### Critical files (modify)

- `chefflow/src/core/events/llm/eventGen.ts` — replace `stripWrapper` call at line 59 with `stripMarkdownFences`, delete local function (lines 124–140).
- `chefflow/src/core/events/llm/menuCheck.ts` — same migration at line 100; delete local function (lines 120–136).

### Critical files (create)

None.

### Verification

- `npm run lint` and `npm test` (existing `eventGen.test.ts` and `menuCheck.test.ts` already cover the fenced-JSON case — they must still pass without modification).
- Grep `chefflow/src/` for `stripWrapper` → expect zero hits.
- Manual: trigger Menu Check with a Groq response wrapped in ` ```json ... ``` ` — must not throw `LlmValidationError`-equivalent.

---

## (b) Link AI workflow ↔ event — close the remaining gaps

### Audit (what's already done)

- `EventView.tsx:213` (`WorkflowCta`) renders **View workflow** when `event.workflow` is non-empty, otherwise **Generate Workflow**; shows step count + start time.
- `Workflow.tsx:299` `handleSave` writes `workflow` + `workflowDishesHash`, then `navigate('/events/${id}')`.
- `Workflow.tsx:280–284` computes `isStale` via `hashDishes(event.dishes) !== event.workflowDishesHash`.
- `Workflow.tsx:444–455` renders the **amber staleness banner** when `isStale` is true. **Already wired — confirmed.**
- `Workflow.tsx:344` breadcrumb currently only links to `/workflows` (the library), not back to the source event.
- `EventCard.tsx` shows title / dish count / notes — no workflow indicator.

### Approach

Two tiny additions, both in components that already own the relevant data:

1. **Workflow page breadcrumb back to event.** In the header row at `Workflow.tsx:343`, add a second `<Link>` to `/events/${event.id}` next to the existing "Workflows" link, labeled with the event title. Use `Calendar` icon (already imported). Keep both — the existing "Workflows" link goes to the library, the new one goes to the source event.
2. **EventCard workflow indicator.** In `EventCard.tsx` add a third `<dl>` row, rendered only when `event.workflow && event.workflow.length > 0`. Show `Sparkles` icon + step count, e.g. "Workflow · 12 steps". Reuse the `Sparkles` icon from `lucide-react` (already used in `EventView.tsx:222`). No click handler needed — the whole card already navigates to `EventView`, which surfaces the View workflow CTA.

No new types, no repo changes — `event.workflow` is already on `KitchenEvent` (`core/types.ts:132`) and is loaded by `listEvents` / `getEvent` today.

### Critical files (modify)

- `chefflow/src/ui/pages/Workflow.tsx` — add a second breadcrumb `<Link>` to `/events/${event.id}` in the header block at line ~343.
- `chefflow/src/ui/components/EventCard.tsx` — append a conditional `<div>` inside the `<dl>` at line ~37 showing `Sparkles` + `"Workflow · {n} step(s)"` when `event.workflow?.length > 0`.

### Critical files (create)

None.

### Verification

- `npm run lint` and `npm test`.
- Manual: open an event with a saved workflow → card shows the indicator; open the workflow page → both breadcrumbs visible; clicking the event-title breadcrumb lands on `EventView`.
- Staleness banner: confirmed already wired in `Workflow.tsx:444–455` against `workflowDishesHash` — no further work.

---

## (c) Click-to-edit dish time on the event editor

### Audit

- `DishRow.tsx:60–63` renders the clock-icon + `formatDateTime(value.startAt)` as static text.
- `EventEditor.tsx:558` `DraggableDish` wraps `DishRow` in `Draggable`; the drag handle is the separate `GripVertical` span at line 588, so dragging is **already isolated** from the row body.
- `core/util/datetime.ts:7,14` exports `toLocalInputValue` / `fromLocalInputValue` (round-trips `datetime-local` input ↔ ISO).

### Approach

Smallest viable inline-edit pattern, contained inside `DishRow`:

1. Add an optional `onTimeChange?: (iso: string) => void` prop to `DishRow`. When omitted, the time stays static (preserves existing call sites in `EventView`-adjacent contexts if any — and `DraggableDish` will always pass it).
2. Inside `DishRow`, local `useState<boolean>` for `editingTime`. The clock span becomes a `<button>` that flips `editingTime` to `true`.
3. When editing, swap the span for an `<input type="datetime-local">` (use `datetime-local` rather than `time` so date stays editable too — matches the existing `DishForm` field and `toLocalInputValue` helper). `defaultValue={toLocalInputValue(value.startAt)}`. Auto-focus on mount.
4. Commit on `blur` and on `Enter`: parse via `fromLocalInputValue`; if valid + changed, call `onTimeChange(iso)`; flip `editingTime` to `false`. Cancel on `Esc`: just flip back without committing.
5. Stop event propagation on the input's `onMouseDown`, `onPointerDown`, and `onKeyDown` so `@hello-pangea/dnd` does not pick up a drag while the user is interacting. `Draggable` is already `isDragDisabled` when DishForm is open; this prop does not cover inline-edit, hence the explicit `stopPropagation`.
6. In `EventEditor.tsx`, the `DraggableDish` passes `onTimeChange` that calls a new `updateDish(dishId, { startAt })` helper sibling to the existing edit-confirm flow. The handler must `setDirty(true)` and merge into `state.event.dishes` immutably, matching the existing `patch` / `update` idioms at `EventEditor.tsx:72–80`.

The simpler `<input type="time">` alternative was rejected because dishes can fall on different dates than the event's `serveAt`, and a time-only input silently coerces to "today" — a regression versus the current `DishForm` which uses `datetime-local`.

### Critical files (modify)

- `chefflow/src/ui/components/DishRow.tsx` — add `onTimeChange` prop, local `editingTime` state, swap clock span for `<input type="datetime-local">` when editing, wire blur/Enter/Esc + `stopPropagation`.
- `chefflow/src/ui/pages/EventEditor.tsx` — thread `onTimeChange` through `DraggableDish` (props at line 545, render at line 596); add an `updateDishTime(dishId, iso)` helper that produces a new dish array and calls `update('dishes', next)`.

### Critical files (create)

None. Reuses `toLocalInputValue` / `fromLocalInputValue` from `chefflow/src/core/util/datetime.ts:7,14`.

### Verification

- `npm run lint` and `npm test` — existing `EventEditor.test.tsx` / `DishRow.test.tsx` (if present) must still pass.
- Add one unit test in the DishRow test file: click the time → input appears with the round-tripped local value; type a new value + Enter → `onTimeChange` called with the corresponding ISO; press Esc → `onTimeChange` not called.
- Manual: in the editor, click the time on a dish row → input appears; commit → dish row re-renders with new time; drag the row's grip handle while not editing → still draggable; try to drag while editing → handle drag still works but clicks on the input do not trigger drag.
