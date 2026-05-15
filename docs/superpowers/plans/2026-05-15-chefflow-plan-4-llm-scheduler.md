# ChefFlow Plan 4 — LLM-driven Workflow Scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deterministic rule-driven scheduler from [Plan 3 Task A](2026-05-14-chefflow-plan-3-workflow-scheduler.md) with an LLM that reads `CulinaryRule.md` as guidance and produces the workflow JSON directly. The UI (Plan 3 Tasks B–D — workflow page, persistence, color filter, per-chef lists) is reused unchanged; only the engine changes.

**Architecture:** Browser SPA → POST to **Groq's free-tier API** (`api.groq.com`, OpenAI-compatible) using **Llama 3.3 70B Versatile**. CulinaryRule.md is embedded into the system prompt verbatim. The LLM returns a JSON object matching a hand-rolled schema; a validation pass repairs / rejects malformed output before mapping back to `ScheduledStep[]`. The user's Groq API key is stored in `localStorage` via a Zustand-with-persist store, never in git, never logged.

**Tech additions:**
- No new runtime deps. Browser `fetch` calls Groq directly (Groq supports CORS for the OpenAI-compatible endpoint).
- Vite's `?raw` import to bake `CulinaryRule.md` into the bundle at build time.

**Supersedes:** Plan 3 Task A's `core/scheduler/scheduleEvent.ts` (kept in-tree as a test oracle / fallback fixture, no longer called from production). Plan 3 Tasks B–D remain valid as-is.

---

## UX Decisions Locked Here

- **Replace, not augment.** The LLM is the only scheduler in production. The deterministic algorithm stays in `core/scheduler/` for tests and as a future fallback, but the workflow page calls the LLM.
- **One model for v1.** `llama-3.3-70b-versatile` on Groq. Swappable later via the settings sheet, but no model-picker UI in this plan.
- **API key in localStorage.** First-time user opens the workflow page → empty-state with a "Connect Groq" button → modal with paste-an-API-key input. Stored under `chefflow:llm-settings` via Zustand persist. Cleared with a "Forget" button.
- **Privacy disclosure.** Settings sheet states clearly: *"Your event title, dish names, recipe names, and recipe steps will be sent to Groq's servers to generate the workflow. Groq's free tier is governed by their data policy at console.groq.com/docs/policies."*
- **Cache via existing snapshot.** No new caching layer. The workflow page already persists the result to `event.workflow` (Plan 3 Task C). LLM is only called on Regenerate or first visit; the saved snapshot is the cache.
- **Non-streaming.** Response is small (2–8 KB). Streaming UX adds complexity without payoff. A simple spinner during the call.
- **Failure mode = clear error.** If the LLM call errors (no API key, rate-limited, network), the page shows a banner with the underlying message and a Retry button. No silent fallback to the deterministic scheduler — the user asked for *Replace*.

---

## File Structure (Plan 4 Creates / Modifies)

```
docs/superpowers/plans/
└── 2026-05-15-chefflow-plan-4-llm-scheduler.md   # this file (NEW)

chefflow/
├── src/
│   ├── core/
│   │   └── scheduler/
│   │       ├── scheduleEvent.ts                  # KEEP — moves to "fallback / oracle" role
│   │       └── llm/
│   │           ├── prompt.ts                     # NEW — system + user prompt builders
│   │           ├── prompt.test.ts                # NEW
│   │           ├── responseSchema.ts             # NEW — hand-rolled validator
│   │           ├── responseSchema.test.ts        # NEW
│   │           ├── groqClient.ts                 # NEW — POST to Groq's chat-completions
│   │           ├── groqClient.test.ts            # NEW — mocked fetch
│   │           ├── llmScheduler.ts               # NEW — main entry, ScheduledStep[] out
│   │           └── llmScheduler.test.ts          # NEW — mocked client
│   ├── state/
│   │   ├── llmSettingsStore.ts                   # NEW — Zustand persist (apiKey + model + enabled)
│   │   └── llmSettingsStore.test.ts              # NEW
│   └── ui/
│       ├── components/
│       │   └── LlmSettingsSheet.tsx              # NEW — modal for the API-key paste box
│       └── pages/
│           └── Workflow.tsx                      # MODIFY — call llmScheduler instead of scheduleEvent;
│                                                 #          loading + error UI; "Connect Groq" empty state
```

---

## Data Flow

```
User opens /workflows/:eventId
     │
     ▼
Workflow page loads event + recipes from Dexie
     │
     ├── event.workflow set?  → render snapshot, skip LLM
     │
     └── no snapshot:
         │
         ▼
   llmScheduler.scheduleEventLLM({ event, recipes })
         │
         ├── build prompt (CulinaryRule.md + event JSON + recipes JSON)
         ├── groqClient.complete(systemPrompt, userPrompt, model, apiKey)
         │   └── POST https://api.groq.com/openai/v1/chat/completions
         │       { model, messages, response_format: { type: "json_object" }, temperature: 0 }
         ├── parse + validate response.choices[0].message.content
         └── map LLM JSON → ScheduledStep[]
              │
              ▼
   render in NestedDragDropBuilder (Plan 3 Task B unchanged)
              │
              ▼
   User clicks Save → workflow + dish-hash persisted (Plan 3 Task C)
   User clicks Regenerate → snapshot cleared, LLM re-called
```

---

## Data Model

No changes to `ScheduledStep` or `KitchenEvent`. The new schema is internal to the LLM module:

```ts
// core/scheduler/llm/responseSchema.ts
interface LlmStep {
  stepId: string;          // synthesized as `${dishId}:${recipeStepId}`
  dishId: string;
  recipeStepId: string;
  text: string;
  startAt: string;         // ISO 8601 with Z
  endAt: string;
  durationSec: number;
  phase: 'prep' | 'cook' | 'serve' | 'sanitize';
  rulesApplied: number[];
  warnings: string[];
}

interface LlmResponse {
  steps: LlmStep[];
}
```

The mapper `llmScheduler.ts` fills in the remaining `ScheduledStep` fields (`recipeId`, `dishLabel`, `kind`, `thermalClass`, `allergenClass`, `dependsOnStepIds`, `id`) by lookup against the source event + recipes — those are deterministic and shouldn't depend on the LLM.

---

## Prompt Sketch

```
SYSTEM:
You are a kitchen workflow scheduler. Apply these rules strictly:

<CULINARY_RULES>
{verbatim contents of CulinaryRule.md}
</CULINARY_RULES>

Output a single JSON object: { "steps": [ ... ] }.
Required keys per step: stepId, dishId, recipeStepId, text, startAt, endAt,
durationSec, phase, rulesApplied, warnings.

Hard constraints:
- The LAST step (chronologically) MUST have endAt === <event.serveAt>
- Each step's startAt + durationSec*1000 === endAt
- Cover every recipe step of every non-prepared dish
- Times in ISO 8601 with a "Z" suffix
- phase ∈ {prep, sanitize, cook, serve}
- rulesApplied lists the CulinaryRule numbers (1..6) that drove the placement
- Return ONLY the JSON. No prose, no markdown fences.

USER:
EVENT:
{ id, title, serveAt, dishes: [{ id, name, recipeId, portions, isPrepared }] }

RECIPES:
{ <recipeId>: { id, title, steps: [{ id, text, phase, kind, thermalClass, allergenClass, durationSec, dependsOn }] } }

Produce the workflow.
```

`temperature: 0` so re-runs are stable (Groq honors this).
`response_format: { type: "json_object" }` forces JSON.

---

## Validation Layer

After parse, the validator checks:
1. `steps` is a non-empty array (unless every dish is prepared, then a single placeholder is OK)
2. Every required key is present and the right type
3. Every dish's recipe steps appear at least once (no LLM amnesia)
4. `endAt = startAt + durationSec * 1000` within ±1s tolerance
5. The chronologically last step's `endAt` matches `event.serveAt` within ±1s
6. `phase` ∈ allowed set
7. `rulesApplied` is an integer array

If any fail: throw a `LlmValidationError` with the specific failure. The Workflow page renders the error banner.

---

## Settings Sheet — `LlmSettingsSheet.tsx`

A small modal:

```
┌─────────────────────────────────────────────────────┐
│  Connect to Groq                              [×]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ChefFlow uses Groq's free tier to generate         │
│  workflows from your recipes + CulinaryRule.md.     │
│                                                     │
│  1. Sign up at https://console.groq.com (free)     │
│  2. Create an API key (Settings → API Keys)        │
│  3. Paste it below                                  │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ gsk_...                                       │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Model: Llama 3.3 70B Versatile (recommended)      │
│                                                     │
│  Stored in your browser's localStorage. Never in    │
│  git or our servers. "Forget" wipes it anytime.    │
│                                                     │
│  Privacy: event titles, dish names, and recipe     │
│  steps are sent to Groq. See console.groq.com      │
│  /docs/policies.                                    │
│                                                     │
│              [Forget]      [Cancel]   [Save key]    │
└─────────────────────────────────────────────────────┘
```

Triggered by a "Connect Groq" CTA in the empty / error state of the workflow page, plus a small gear icon in the header for editing later.

---

## Task Breakdown

### Task A — Plan + ToDoList (~10 min)
- [x] Write this plan doc
- [ ] Update `ToDoList.md` to supersede Plan 3 Task A; add LLM-specific follow-ups
- [ ] Commit: `docs(plan): Plan 4 — LLM workflow scheduler`

### Task B — Pure modules + tests (TDD, ~25 min)
- [ ] `state/llmSettingsStore.ts` (Zustand persist) + tests
- [ ] `core/scheduler/llm/prompt.ts` + tests
- [ ] `core/scheduler/llm/responseSchema.ts` validator + tests
- [ ] `core/scheduler/llm/groqClient.ts` with mocked fetch + tests
- [ ] `core/scheduler/llm/llmScheduler.ts` orchestrator + tests
- [ ] Commit: `feat(scheduler/llm): Groq-backed workflow scheduler (modules + tests)`

### Task C — UI (~15 min)
- [ ] `LlmSettingsSheet.tsx` modal
- [ ] `Workflow.tsx`: replace `scheduleEvent` call with `llmScheduler.scheduleEventLLM`; loading state; error banner with Retry; "Connect Groq" empty state when no API key
- [ ] Smoke test the file path with a fake mocked response
- [ ] Commit: `feat(ui): LLM-driven workflow page with Groq settings sheet`

### Task D — Manual smoke (~5 min)
- [ ] Sign up at console.groq.com, get a free API key
- [ ] Open `/workflows/e_demo_main` → click Connect Groq → paste key → workflow renders
- [ ] Verify times reverse-engineer to 18:00, all steps covered, rules applied
- [ ] No commit (just verification)

---

## What this gets us

- **Smarter scheduling.** The LLM can apply rule nuance the deterministic algorithm can't (e.g., "salad dressing can be whisked during the steak rest" — a Rule 6 multi-component sync).
- **Free.** Groq's free tier is generous (~14,400 reqs/day, ~30 req/min) — more than enough.
- **Fast.** Groq's hardware does Llama 3.3 70B in ~1 second.
- **Private-ish.** Recipes + event names go to Groq. No PII; no payment info. If the user wants full privacy later, swap to Ollama via the same `groqClient.ts` interface (Ollama serves an OpenAI-compatible endpoint).

## Risks / open questions

- **JSON-mode reliability.** Llama 3.3 70B is strong at JSON, but ~1% of responses may need a re-try. The validator catches this; we'll add an automatic retry-once-on-validation-failure in a follow-up commit if it becomes a problem.
- **CORS.** Groq's `api.groq.com` allows browser calls. If they change that, we'd need a tiny proxy server.
- **Rate limits.** Single-user app — fine. If shared, we'd add per-key throttling.
- **Free-tier policy changes.** If Groq removes free tier or rate-limits aggressively, the same module works against OpenRouter / Together.ai with a different endpoint + key.

---

## Out of scope for Plan 4

- Local Ollama integration (covered by leaving the client interface open; future plan)
- Model picker UI (hardcoded to Llama 3.3 70B)
- Two-stage hybrid (LLM proposes, rules validate/repair) — explicitly rejected in favor of pure replacement
- Streaming UX
- Cost tracking (free tier, irrelevant)
- Function-calling / structured-output beyond JSON-mode (Groq doesn't expose strict structured output yet)
