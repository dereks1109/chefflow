# CLAUDE.md - ChefFlow Project Specifications

## 📖 Project Overview
CLAUDE (ChefFlow) is a mobile-first web application designed for professional chefs to manage kitchen operations. It transforms static recipes 
## 🛠 Technology Stack
- **Frontend**: React (Next.js / Vite) with Tailwind CSS.
- **State Management**: Zustand (for global unit and portion states).
- **Markdown Engine**: `react-markdown` with custom components for timers and ingredients.
- **Unit Logic**: `convert-units` or `mathjs` for physical quantity calculations.
- **Persistence**: IndexedDB (via Dexie.js) for offline kitchen use.

## 🎨 UI/UX Principles
- **High Contrast**: Optimized for harsh kitchen lighting. Dark mode uses a neutral dark grey scale (base `#171717`), not pure black — the surface tokens `surface-0`/`1`/`2`/`3` in `chefflow/tailwind.config.ts` are the source of truth.
- **Kitchen-Ready**: Large touch targets (min 44x44px) and Web Wake Lock API to keep the screen on.
- **Mobile-First**: Primary focus on single-hand operation during active cooking.

## ⚖️ Unit System
### 1. Global Unit System Toggle
- **Options**: `Metric` (g, kg, L), `Imperial` (oz, lb, gal), or `Auto` (Original Recipe).
- **Real-time Conversion**: Switching systems triggers immediate conversion of all measurements (e.g., 1kg ↔ 2.2lb).
- **Normalization**: 
  - Weight: Auto-upgrade `1000g` to `1kg`.
  - Volume: Auto-upgrade `1000ml` to `1L`.

### 2. Dynamic Portion Scaling
- **Linear Scaling**: Users can adjust the "Yield/Portion" count (e.g., 4pax to 50pax).
- **Scaling Syntax**: Ingredients must be tagged as `{amount|unit|name}` for the parser to identify and multiply values.
- **Lock Feature**: Allow chefs to "Lock" specific ingredients (like salt or spices) to prevent over-scaling.

### 3. Conversion Library
- **Weight**: g, kg, oz, lb.
- **Volume**: ml, L, tsp, tbsp, cup, fl oz, pt, qt, gal.
- **Temperature**: Automatic conversion between Celsius (°C) and Fahrenheit (°F) for both ingredient and cooking temperatures.

## 📝 Markdown & Data Structure
Recipes are stored in Markdown with a structured header (Front Matter):
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
## Workflow
1. <Timer duration="600s">Sear the beef</Timer> until browned.
2. Deglaze the pan with wine.
```

## ⌨️ Development Commands
- `npm run dev`: Start development server.
- `npm run build`: Build for production (PWA).
- `npm run lint`: Run ESLint checks.

## 🕵️ Coding Standards
- **Precision**: Use `Decimal.js` for financial/critical unit math to avoid floating-point errors.
- **Parser**: Keep conversion logic in a dedicated unit engine module separate from UI components.
- **Accessibility**: Ensure all timers have audible alerts (Web Audio API) for noisy environments.

## 🎯 Current Focus
1. Implement the **Unit Conversion Engine** with Metric/Imperial toggles.
2. Develop the **Portion Scaler** that updates the ingredient list dynamically.
3. Build the **Workflow Scheduler** that merges multiple recipe workflows into a coordinated kitchen schedule.

---

## 🤖 Agent Protocol — State Persistence

This project runs in autonomous mode with strict state-persistence. Two files cooperate, with no overlap:

| File | Purpose | Owner | Lifetime |
|---|---|---|---|
| [ToDoList.md](ToDoList.md) | Manually-curated backlog of deferred work, future ideas, security follow-ups, recently-done log. | User-curated, agent assists. | Durable; lives in git. |
| [TODO_PERSISTENCE.md](TODO_PERSISTENCE.md) | Live snapshot of *current-session* unfinished work. Auto-generated, auto-cleaned. | Agent-owned. | Ephemeral; must stay lean. |

### Rule 1 — Session Cap Auto-Save (best-effort)

When the context window approaches its cap, dump every in-flight task into `TODO_PERSISTENCE.md` *before* the conversation has to be compacted. Each entry MUST include the **exact file paths involved**, formatted like:

```markdown
- [ ] Fix drag lag while reordering long step lists — `chefflow/src/ui/components/NestedDragDropBuilder.tsx`
- [ ] Persist workflow state to Dexie — `chefflow/src/ui/pages/Workflow.tsx`, `chefflow/src/db/eventsRepo.ts`
```

**Honesty about the limitation:** the agent does not have a direct token-usage readout it can poll from instructions alone. Dumping triggers are best-effort heuristics + explicit signals:

1. **Always** dump when the user says "save state", "session ending", "stop here", "we're done for now", or similar.
2. **Proactively** dump after a long burst of work (~30+ exchanges) or any time a meaningful piece of work would be lost on session reset.
3. **If you want a mechanical trigger** at a specific context fill level, configure a `PreCompact` hook in `~/.claude/settings.json` — ask the agent to wire one up.

### Rule 2 — Session Refresh Recovery

At the start of any new session, the agent's first read MUST be `TODO_PERSISTENCE.md`. If it is non-empty:

1. Print exactly: `🔄 Context Restored. Resuming work on <file path> for <task>.` — one line per pending task.
2. Read the relevant file(s) and pull up the code snippet so work can continue without re-explanation.

If `TODO_PERSISTENCE.md` is empty, proceed with the user's first prompt normally.

### Rule 3 — Real-time File Clean-up

The instant a task is confirmed working by the user ("works", "looks good", "ship it", etc.), immediately edit `TODO_PERSISTENCE.md` to **remove** that line and its file paths in full. The file must never accumulate done items. Confirmed work belongs in `ToDoList.md`'s "✅ Recently done" section or just `git log`, not here.

### Tone

Keep `TODO_PERSISTENCE.md` structured and tight. No prose, no rationale — just `- [ ] Task — path/to/file.ts` entries grouped under the three section headers (`In-flight tasks`, `Refactors pending`, `Bug states`).

## State & Task Persistence Protocol (Strict)
1. **Session Cap Auto-Save**: Monitor your context usage. When approaching the 95% limit, immediately pause and dump all unfinished feature implementations, pending bugs, and next-step to-dos into `TODO_PERSISTENCE.md` in markdown task format.
2. **File Path Logging**: For each pending task in `TODO_PERSISTENCE.md`, you MUST explicitly log the exact file paths involved (e.g., `- [ ] Fix drag lag in src/components/RecipeBuilder.tsx`).
3. **Session Refresh Recovery**: Upon initialization of any new session or chat refresh, your absolute first action must be to read `TODO_PERSISTENCE.md` to restore the previous engineering context and report it to the user.
4. **Real-time Clean-up**: Every time a specific engineering sub-task is completed, you must immediately remove that entry from `TODO_PERSISTENCE.md` to save context window space.
