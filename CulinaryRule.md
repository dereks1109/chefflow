# Culinary Workflow Engineering Rules

These rules guide ChefFlow's scheduler to produce kitchen workflows that
balance food safety, food quality, and team efficiency at scale. They
apply to events with multiple dishes and one-to-many chefs. Each rule
has a number used in `rulesApplied` on scheduled steps so chefs can see
which principles drove each placement.

---

### ⏱️ Rule 1: Timeline (Reverse Engineering)
- **Anchor at service time:** the chronologically last step ends at the
  event's `serveAt` (or, for dishes with their own `dish.startAt`, at
  that dish's anchor).
- **Chain backward:** sum every dependent step's `durationSec`, scaled
  for portion count, to find the kitchen start time per dish.
- **Reserve plating time:** always leave at least 3 minutes before
  `serveAt` for plating + walk-out, even if no recipe step claims it.
- **Surface the critical path:** the dish with the longest backward
  chain is the one that dictates kitchen start time — call this out in
  the first step's `warnings` (e.g. `"critical path: stew (2h 45m)"`).

### 🌡️ Rule 2: Thermal Stability
- **Cook stable foods first:** dishes with `thermalClass: 'stable'`
  (stews, braises, soups, slow-cooks) start early; flavour usually
  improves with hold time.
- **Hot hold ≥ 63 °C (UK FSA):** stable dishes destined to hold should
  carry a `warnings: ["hold at >=63°C"]` note on their last cook step.
- **Plan the hold:** specify how the dish stays warm (lid on stockpot,
  warming drawer, bain-marie). If a step is followed by a >30-minute
  gap to service, add a `warnings: ["needs warming method"]` note.

### ⚡ Rule 3: Last-Minute (Flash)
- **Protect delicate proteins and crispy textures:** anything with
  `thermalClass: 'flash'` (stir-fries, pan-seared fish, fried items)
  starts within the last 10 minutes before serve.
- **Rest where needed:** for grilled/seared proteins, insert a 2–3
  minute rest step before plating.
- **Mise en place gate:** the first prep step for any flash dish must
  end before the cook step starts, by at least 2 minutes, so the chef
  has cut/measured everything within arm's reach before the heat hits.

### 🧺 Rule 4: Batching
- **Consolidate similar prep:** group like tasks across dishes — chop
  all onions in one prep block, slice all cheese in one block — and
  emit a single combined step where possible (cite Rule 4 in
  `rulesApplied`).
- **Respect pan capacity:** if a recipe's `panCapacityPortions` is set
  and the dish's `portions` exceeds it, split the cook step into
  back-to-back batches and warn `"split into N batches to avoid steaming"`.
- **Oven temperature grouping:** dishes sharing oven temperature within
  ±10 °C can share an oven slot; flag conflicts when two dishes need
  the oven at incompatible temperatures simultaneously.

### 🛡️ Rule 5: Safety & Allergen Isolation
- **Order operations:** for each chef in each phase, prep allergen-free
  items first, then allergens, then major allergens (peanut, shellfish).
- **Dedicated tools:** dishes that contain peanut, shellfish, or sesame
  should be flagged with a `warnings: ["use dedicated board + knife"]`
  note on their first prep step.
- **Sanitize transitions:** insert a 5-minute sanitize step whenever a
  chef's timeline transitions from an allergen-free step to an allergen
  step within the same phase.

### 🧩 Rule 6: Multi-Component Sync
- **Honour dependencies:** if step B's `dependsOn` includes step A,
  schedule B to start no earlier than A's `endAt`.
- **Avoid overcook from waiting:** if a dependent component would be
  ready more than 5 minutes before its consumer, schedule the dependent
  later (closer to consumption) rather than earlier.
- **Plating-ready signal:** the LAST cook step of every dish should
  carry `phase: 'serve'` and a `warnings: ["ready for plating"]` note,
  so the head chef can call service when all dishes report ready.

### 👩‍🍳 Rule 7: Chef Team Parallelism (NEW)
- **Honour `dish.colorTag`:** treat each colorTag as one chef. Steps
  for dishes sharing a colorTag run sequentially on that chef's
  timeline; steps across colorTags can run in parallel.
- **Rebalance bottlenecks:** if one chef's total active time exceeds
  another by more than 30 minutes, surface a
  `warnings: ["consider reassigning dish X to chef Y"]` on the
  overloaded chef's first step.
- **Anchor handoffs:** when a step depends on another chef's output
  (e.g. red chef plates a sauce made by green chef), inject a
  zero-duration `phase: 'serve'` handoff marker step on both timelines
  at the handoff moment.

### 🔥 Rule 8: Equipment Scheduling (NEW)
- **Track shared equipment:** the scheduler maintains an implicit
  inventory: oven (1 slot per temperature), stove (4 burners), and any
  equipment named in a step's `equipment` field.
- **Detect contention:** when two `kind: 'active'` steps need the same
  equipment in overlapping windows, the second is shifted later and
  carries a `warnings: ["delayed N min — oven contention"]` note.
- **Prefer oven over stove for parallelism:** when a dish can be either
  oven-roasted or pan-roasted, prefer the oven slot if multiple
  burner-cooks are competing for stove top.

### 🍽️ Rule 9: Plating & Service Window (NEW)
- **Reserve a plating window:** the last 3 minutes before `serveAt`
  belong to plating; no cook step may start in this window. If a flash
  dish's cook step would land here, shift it earlier and warn.
- **"Fire" signal:** the start of the plating window is the single
  service trigger — all `phase: 'serve'` steps fire together so courses
  walk out together. Surface a milestone `text: "FIRE — plating begins"`
  at that exact moment.
- **Allergen-isolated plates first:** if any dish is flagged with a
  major allergen, plate the allergen-free / dietary-special plates
  first to reduce cross-contamination risk during plating.

### 🛟 Rule 10: Buffer & Critical Path (NEW)
- **Identify the critical path:** the dish whose backward chain is
  longest defines the kitchen start time. Call this out explicitly in
  the first scheduled step's `warnings`.
- **Pad non-critical paths:** dishes off the critical path get a 10%
  buffer added to their kitchen start time, so a small slip on a side
  dish doesn't cascade into late service.
- **Surface the slack:** when a side dish has more than 15 minutes of
  slack before its consumer, note it in `warnings` (e.g.
  `"15 min slack — fine to start late"`).

---

## Notes for prompt authors

These rules map onto `ScheduledStep.rulesApplied` (integers 1–10) so the
Workflow page can render small numbered badges on each step. The LLM
scheduler embeds this file verbatim in its system prompt; the local
fallback enforces Rules 1, 4 (partial), 5, 6 (dependency ordering)
directly in code.
