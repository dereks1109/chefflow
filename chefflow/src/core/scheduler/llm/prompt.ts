import type { KitchenEvent, Recipe } from '../../types';
// Vite's ?raw import bakes CulinaryRule.md into the bundle at build time.
import CULINARY_RULES from '../../../../../CulinaryRule.md?raw';

// ---------------------------------------------------------------------------
// Prompts for the LLM workflow scheduler.
//
// SYSTEM prompt: the rules + JSON-output contract. Constant per build.
// USER prompt: the event + recipes JSON for this specific call. Built fresh.
// ---------------------------------------------------------------------------

export function buildSystemPrompt(): string {
  return `You are a kitchen workflow scheduler. Apply these culinary rules strictly when producing the workflow.

<CULINARY_RULES>
${CULINARY_RULES.trim()}
</CULINARY_RULES>

OUTPUT FORMAT: a single JSON object with the shape:
{
  "steps": [
    {
      "stepId": "string — unique id for this step in the workflow (use \`<dishId>:<recipeStepId>\` for real steps, or \`<dishId>:prepared\` for pre-prepared dishes with no recipe)",
      "dishId": "string — the dish.id this step belongs to (empty for sanitize injections)",
      "recipeStepId": "string — the underlying recipe step id, or 'prepared' / 'sanitize' for synthesized steps",
      "text": "string — the recipe step text verbatim (or the synthesized description for prepared / sanitize)",
      "startAt": "ISO 8601 datetime with Z suffix",
      "endAt": "ISO 8601 datetime with Z suffix",
      "durationSec": <number>,
      "phase": "prep" | "cook" | "serve" | "sanitize",
      "rulesApplied": <integer array — CulinaryRule numbers (1..10) that drove this step's placement>,
      "warnings": <string array — any warnings for the chef; empty array if none>
    }
  ]
}

HARD CONSTRAINTS — these MUST hold or the output is rejected:
1. The chronologically last step's endAt MUST exactly equal the event's serveAt.
2. For every step: startAt + durationSec*1000 === endAt (within 1 second tolerance).
3. Every recipe step of every non-prepared dish in the event MUST appear at least once. Prepared dishes (isPrepared=true) get a single placeholder step.
4. Times are in ISO 8601 with a "Z" suffix.
5. phase is one of: "prep", "cook", "serve", "sanitize".
6. rulesApplied lists the rule numbers (1..10 from <CULINARY_RULES>) that drove the placement; e.g. a flash-cooked step at the end has [1, 3].
7. When transitioning from an allergen-free prep step to an allergen prep step within the same chef's timeline, inject a 5-minute "sanitize" step (phase="sanitize", durationSec=300, rulesApplied=[5]).

WARNINGS CONVENTIONS — when a rule asks for a warning, use these exact strings so the UI can parse them consistently:
- Rule 1 (critical path): "critical path: <dish title> (<H>h <M>m)" on the first scheduled step.
- Rule 2 (thermal): "hold at >=63°C" on the last cook step of a stable-class dish that needs to hold; "needs warming method" when the hold gap exceeds 30 minutes.
- Rule 4 (batching): "split into <N> batches to avoid steaming" when pan capacity is exceeded.
- Rule 6 (plating-ready): "ready for plating" on the LAST cook step of every dish.
- Rule 7 (parallelism): "consider reassigning dish <X> to chef <Y>" on the overloaded chef's first step.
- Rule 8 (equipment): "delayed <N> min — oven contention" (or stove, etc.) when an equipment shift was applied.
- Rule 9 (fire): "FIRE — plating begins" as the step text on the plating-window milestone (also phase="serve").
- Rule 10 (slack): "<N> min slack — fine to start late" on a side dish off the critical path.

Return ONLY the JSON object. No prose, no markdown fences, no comments.`;
}

export function buildUserPrompt(event: KitchenEvent, recipes: Map<string, Recipe>): string {
  // Shape the event so the LLM sees only what it needs. colorTag is included
  // (Rule 7 needs chef-team parallelism); numberOfGuests + notes flow through
  // so the LLM can weigh dietary signals; dish.startAt feeds Rule 1's anchor.
  const eventForLlm = {
    id: event.id,
    title: event.title,
    serveAt: event.serveAt,
    numberOfGuests: event.numberOfGuests,
    notes: event.notes,
    dishes: event.dishes.map((d) => ({
      id: d.id,
      name: d.name,
      recipeId: d.recipeId,
      portions: d.portions,
      isPrepared: Boolean(d.isPrepared),
      startAt: d.startAt,
      colorTag: d.colorTag,
      notes: d.notes,
    })),
  };

  // Only include recipes referenced by the event's dishes, to keep the prompt
  // tight (Groq's free tier has a token budget per request).
  const referencedIds = new Set(
    event.dishes.map((d) => d.recipeId).filter((id): id is string => Boolean(id)),
  );
  const recipesForLlm: Record<string, unknown> = {};
  for (const id of referencedIds) {
    const r = recipes.get(id);
    if (!r) continue;
    recipesForLlm[id] = {
      id: r.id,
      title: r.title,
      originalYield: r.originalYield,
      steps: r.steps.map((s) => ({
        id: s.id,
        text: s.text,
        phase: s.phase,
        kind: s.kind,
        thermalClass: s.thermalClass,
        allergenClass: s.allergenClass,
        durationSec: s.durationSec,
        dependsOn: s.dependsOn,
        batchKey: s.batchKey,
      })),
    };
  }

  return `EVENT:
${JSON.stringify(eventForLlm, null, 2)}

RECIPES:
${JSON.stringify(recipesForLlm, null, 2)}

Produce the workflow JSON now.`;
}
