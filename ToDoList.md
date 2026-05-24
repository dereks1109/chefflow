# ChefFlow — To-Do List

Deferred work, in rough priority order. Tick items as you go; add new ones at the bottom of the relevant section.

---

## 🚀 Next session — pick up here

The single biggest unfinished thread is **Plan 3 (the workflow scheduler)**. Task A is done (commit `f832dbc`); next up is wiring the algorithm into the UI. Recommended order:

- [x] **Plan 3 — Task A**: `core/scheduler/scheduleEvent.ts` pure-function core. ✅ Done — 27 tests, asserts against the Demo Event timeline. **Superseded by Plan 4**: deterministic scheduler is now a test oracle; production path is LLM-driven.
- [x] **Plan 3 — Task B**: workflow page driven by the algorithm for every event. ✅ Done (commit `0c6a5cb`).
- [x] **Plan 3 — Task C**: persistence + reorder + color tags. ✅ Done (commit `1ccb601`).
- [x] **Plan 3 — Task D — filter**: chef filter chips + per-color read-only list. ✅ Done (commits `bd31b50` + `731b443`).
- [ ] **Plan 3 — Task D — print**: dedicated `/workflows/:eventId/print/:color` route with `@media print` rules for paper handouts. (Small finisher.)
- [ ] **Plan 3 — Task E**: `chefflow-mcp/` Node package so other LLMs can call `generate_workflow` as an MCP tool.
- [ ] **Plan 4 — Task B (LLM modules)**: prompt + responseSchema + groqClient + llmScheduler + llmSettingsStore. See [docs/superpowers/plans/2026-05-15-chefflow-plan-4-llm-scheduler.md](docs/superpowers/plans/2026-05-15-chefflow-plan-4-llm-scheduler.md).
- [ ] **Plan 4 — Task C (LLM UI)**: `LlmSettingsSheet.tsx` modal for the Groq API key + replace `scheduleEvent` call in `Workflow.tsx` with `llmScheduler.scheduleEventLLM`.
- [ ] **Plan 4 — Task D (manual smoke)**: connect Groq, verify the Demo Event renders via the LLM.

---

## 🎯 Other deferred features

### Portion Scaler UI
Engine exists in [chefflow/src/core/scaler/scaleRecipe.ts](chefflow/src/core/scaler/scaleRecipe.ts) (Plan 1) and has tests, but no UI. Was briefly prototyped as `RecipeView` at `/recipes/:id` and reverted at the user's request on 2026-05-13.
- [ ] Re-introduce a read-only "cook this" view with a Servings stepper.
- [ ] Re-introduce the 🔒 lock toggle on `IngredientRow` (was removed when the scaler was deferred). Required so salt/spices don't over-scale.

### Unit System Toggle
Zustand store exists (`state/unitSystemStore.ts`). The new `AccountSetupSheet` exposes a Metric / Imperial / Auto picker, but there's no always-visible toggle in the app chrome.
- [ ] Add a `UnitSystemToggle` component (Metric / Imperial / Auto) in the header / mobile top bar so chefs can flip mid-session without opening the setup sheet.

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

## ⚖️ Legal / privacy follow-ups (from Part 3 plan)

Items deferred from the legal-risk audit at `/root/.claude/plans/1-make-every-user-serene-leaf.md` Part 3:

- [ ] Write a privacy policy + ToS at `chefflow/public/privacy.html` and `terms.html`. Blocker: pick a real data-controller contact email (placeholder "privacy@chefflow.example" was rejected this session).
- [ ] Add a consent checkbox to `SignUpScreen.tsx` once the policy pages exist ("I agree to the Terms and acknowledge the Privacy Policy"), block submit until ticked.
- [ ] Separate `KitchenEvent.dietaryRequirements?: string[]` from the freeform `notes` field so health data is independently controllable. Larger refactor — Tier 2 plan item.
- [ ] D1 region pinning (`location_hint = "weur"`) if EU/UK customers materialize. Document in privacy.html when it exists.
- [ ] Sign Cloudflare's + Clerk's DPAs and link them from the privacy policy.

## 🔐 Security / hygiene follow-ups

- [ ] **Rotate Twilio Auth Token** — it was visible in a `bash -x` trace in chat on 2026-05-13. Get a new one at [console.twilio.com](https://console.twilio.com/) and update `~/.claude/.env.whatsapp`.
- [ ] **Activate the WhatsApp Stop hook for the current session** — settings watcher doesn't pick up mid-session changes; open `/hooks` once in this terminal (or restart) to reload. New sessions get it automatically.
- [ ] **WhatsApp sandbox re-enrolment** — Twilio sandbox numbers expire after 72 hours of inactivity. If notifications stop, re-send `join your-code` to `+1 415 523 8886`.

---

## 💡 Ideas to consider (uncommitted, not necessarily next)

- **Chef entities**: named chefs with persistent colors instead of anonymous color tags. Lets task-list headers say "Alice's list" instead of "Red list".
- **Resource awareness**: pan / oven / hob capacity in the scheduler — replace the "infinite parallelism" warning with actual conflict detection.
- **Live cooking mode**: `KitchenPlaceholder` at `/events/:id/cook` becomes the active on-station view ticking through the saved workflow with timers and Web Audio alerts.
- **PWA / offline**: Dexie + sync now handle offline reads/writes (commit `0994648`), but `chefflow/src/pwa/` is still empty — no service worker / installable manifest. Adding those would let chefs install the app and load it cold without network.
- **Demo data refresh**: per-user seed keys are now `chefflow:seeded-demo:<userId>:v5` / `chefflow:seeded-demo-events:<userId>:v5`. Bump the `v5` suffix if demo content changes and should propagate.

---

## ✅ Recently done (for reference; trim periodically)

- 2026-05-24: Legal-risk remediation pass — Tier 1 + Tier 2 of the audit at `/root/.claude/plans/1-make-every-user-serene-leaf.md` Part 3. MIT `LICENSE` + `THIRD_PARTY_NOTICES.md` at repo root; `AccountDataSheet` UI for GDPR Art. 17 delete + Art. 20 export; new `DELETE /api/account` + `GET /api/account/export` worker routes; `chefflow/src/core/llm/sanitize.ts` defense-in-depth PII stripper; truthful Cloudflare-Workers-AI disclosure in `LlmSettingsSheet`; "Powered by Google" attribution in `LocationAutocomplete`; demo recipe authorship comment in `seed.ts`.
- 2026-05-24: Account setup wizard + sign-up toggle. New `AccountSetupSheet` collects display name / unit system / kitchen role on first sign-in (re-openable from the Clerk UserButton menu); `SignInScreen` exposes a Sign in / Create account tab toggle (`ece5bca`).
- 2026-05-24: Pages → Worker forwarding for `/api/sync/*` so the deployed frontend can reach the D1-backed sync handlers (`d406c81`).
- 2026-05-24: Unit-system preference syncs across devices via the `userPrefs` row (`3b128f0`).
- 2026-05-24: Per-user demo recipes + Cloudflare D1 sync with offline support. Dexie v4 adds `ownerId` indexes + soft-delete tombstones; new `syncClient.ts` does push/pull with LWW; new D1 tables `recipes` / `events` / `user_prefs` keyed by `(owner_id, id)`; demo seeds are now per-user with v5 storage keys (`0994648`).
- 2026-05-14: Workflow tab + per-event workflow pages with DnD template (`a78c524`).
- 2026-05-14: Nested drag-and-drop template at `/demo/nested-dnd` (`6864cc3`).
- 2026-05-14: Plan 3 (workflow scheduler) drafted at `docs/superpowers/plans/2026-05-14-chefflow-plan-3-workflow-scheduler.md` (uncommitted).
- 2026-05-14: Dish reorder toggle + en-GB date locale (`51fb407`).
- 2026-05-14: Non-deletable Demo Event seed (`c26669e`).
- 2026-05-14: Events: dishes (replacing sessions) + recipe autocomplete (`12bbddb`).
- 2026-05-13: Events + sessions CRUD with timeline (`02b9f6f`).
- 2026-05-13: WhatsApp hook for usage-reset notifications (in `~/.claude/`, not the repo).
- 2026-05-13: Plan 2a (Recipe CRUD UI) complete (`d8072b4` → `8767031`).
