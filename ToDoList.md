# ChefFlow — To-Do List

Deferred work, in rough priority order. Tick items as you go; add new ones at the bottom of the relevant section.

---

## 🚀 Next session — pick up here

The single biggest unfinished thread is **Plan 3 (the workflow scheduler)**. The plan doc is fully written but no task has started. Recommended order:

- [ ] **Plan 3 — Task A**: implement `core/scheduler/scheduleEvent.ts` (TDD against the Demo Event timeline). See [docs/superpowers/plans/2026-05-14-chefflow-plan-3-workflow-scheduler.md](docs/superpowers/plans/2026-05-14-chefflow-plan-3-workflow-scheduler.md). Tasks A–C ship the must-have feature; D–E unlock the per-chef task lists and the MCP server.
- [ ] **Plan 3 — Task B**: replace the placeholder data on `/workflows/:eventId` with the algorithm's output for *every* event (not just the Demo).
- [ ] **Plan 3 — Task C**: persist workflow edits to Dexie (`event.workflow` field) — currently the Workflow page is component-local and loses state on navigation.
- [ ] **Plan 3 — Task D**: color filter + print view for per-chef task lists.
- [ ] **Plan 3 — Task E**: `chefflow-mcp/` Node package so other LLMs can call `generate_workflow`.

---

## 🎯 Other deferred features

### Portion Scaler UI
Engine exists in [chefflow/src/core/scaler/scaleRecipe.ts](chefflow/src/core/scaler/scaleRecipe.ts) (Plan 1) and has tests, but no UI. Was briefly prototyped as `RecipeView` at `/recipes/:id` and reverted at the user's request on 2026-05-13.
- [ ] Re-introduce a read-only "cook this" view with a Servings stepper.
- [ ] Re-introduce the 🔒 lock toggle on `IngredientRow` (was removed when the scaler was deferred). Required so salt/spices don't over-scale.

### Unit System Toggle
Zustand store exists (`state/unitSystemStore.ts`) but nothing flips it.
- [ ] Add a `UnitSystemToggle` component (Metric / Imperial / Auto).
- [ ] Mount in a settings sheet or app header.

### Plan 2b — Recipe sharing
Originally drafted in the Plan 2a tail; never written as a separate plan doc.
- [ ] Markdown export of a recipe → download `.md`.
- [ ] Copy markdown to clipboard.
- [ ] URL-hash share with `lz-string`.
- [ ] `.md` import with a title-collision dialog.

### Drag-and-drop on workflow steps
Workflow uses `@hello-pangea/dnd` already (currently only on `/workflows/:eventId` via `NestedDragDropBuilder`). Dish reorder elsewhere is still ↑/↓ arrows — fine for short lists, tedious for long ones.
- [ ] Consider unifying on drag-and-drop everywhere reorder appears.

---

## 🛠 Algorithm-specific items (Plan 3 sub-tasks)

These all belong inside Plan 3 Task A but are easy to forget:

- [ ] **Rule 5 sanitize injection**: insert a 5-min sanitize block between allergen-free → allergen prep groups. Hand-coded into the Demo Event placeholder; needs to be auto-emitted by the scheduler.
- [ ] **Rule 4 batching**: consolidate steps with the same `batchKey` across dishes when their time windows overlap.
- [ ] **Edge case — no `serveAt`**: fall back to the latest `dish.startAt`, or `Date.now() + 24h`, with a warning surfaced to the user.
- [ ] **Edge case — missing `durationSec`**: heuristic per `phase`/`kind`, with a "duration estimated" warning on the affected step.
- [ ] **Circular `dependsOn`**: detect, warn, break the cycle at the lowest-dependency node.

---

## 🔐 Security / hygiene follow-ups

- [ ] **Rotate Twilio Auth Token** — it was visible in a `bash -x` trace in chat on 2026-05-13. Get a new one at [console.twilio.com](https://console.twilio.com/) and update `~/.claude/.env.whatsapp`.
- [ ] **Activate the WhatsApp Stop hook for the current session** — settings watcher doesn't pick up mid-session changes; open `/hooks` once in this terminal (or restart) to reload. New sessions get it automatically.
- [ ] **WhatsApp sandbox re-enrolment** — Twilio sandbox numbers expire after 72 hours of inactivity. If notifications stop, re-send `join your-code` to `+1 415 523 8886`.

---

## 💡 Ideas to consider (uncommitted, not necessarily next)

- **Chef entities**: named chefs with persistent colors instead of anonymous color tags. Lets task-list headers say "Alice's list" instead of "Red list".
- **Resource awareness**: pan / oven / hob capacity in the scheduler — replace the "infinite parallelism" warning with actual conflict detection.
- **Live cooking mode**: `KitchenPlaceholder` at `/events/:id/cook` becomes the active on-station view ticking through the saved workflow with timers and Web Audio alerts.
- **PWA / offline**: `chefflow/src/pwa/` directory exists but is empty. Service worker + manifest for true offline kitchen use (matches CLAUDE.md's stated tech direction).
- **Demo data refresh**: bump `chefflow:seeded-demo-v2` → `-v3` if demo recipes get a content edit that should propagate to existing local installs.

---

## ✅ Recently done (for reference; trim periodically)

- 2026-05-14: Workflow tab + per-event workflow pages with DnD template (`a78c524`).
- 2026-05-14: Nested drag-and-drop template at `/demo/nested-dnd` (`6864cc3`).
- 2026-05-14: Plan 3 (workflow scheduler) drafted at `docs/superpowers/plans/2026-05-14-chefflow-plan-3-workflow-scheduler.md` (uncommitted).
- 2026-05-14: Dish reorder toggle + en-GB date locale (`51fb407`).
- 2026-05-14: Non-deletable Demo Event seed (`c26669e`).
- 2026-05-14: Events: dishes (replacing sessions) + recipe autocomplete (`12bbddb`).
- 2026-05-13: Events + sessions CRUD with timeline (`02b9f6f`).
- 2026-05-13: WhatsApp hook for usage-reset notifications (in `~/.claude/`, not the repo).
- 2026-05-13: Plan 2a (Recipe CRUD UI) complete (`d8072b4` → `8767031`).
