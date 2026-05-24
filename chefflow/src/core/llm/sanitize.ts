// Defense-in-depth PII stripper for LLM prompts. Any builder that hands
// a KitchenEvent to an LLM (proxy or direct Groq) MUST run it through
// `stripEventPii` first. The workflow prompt builder in
// `chefflow/src/core/scheduler/llm/prompt.ts` already selects fields by
// allow-list, but this helper guarantees fields stay stripped if a future
// edit accidentally widens the shape — and gives reviewers one obvious
// boundary to audit.
//
// What we strip from a KitchenEvent before sending to an LLM:
//
//   - contactName / contactEmail / contactPhone  → guest/client PII
//   - location                                   → venue PII
//   - budget                                     → commercial sensitive
//   - notes                                      → may contain dietary
//                                                  requirements (health
//                                                  data) by design
//
// What we keep: title, serveAt, dishes (with their per-dish notes, since
// those describe the cooking task, not the guest).

import type { KitchenEvent } from '../types';

export type SafeEventForLlm = Pick<
  KitchenEvent,
  'id' | 'title' | 'serveAt' | 'dishes' | 'sections' | 'workflow' | 'workflowDishesHash'
>;

export function stripEventPii(event: KitchenEvent): SafeEventForLlm {
  return {
    id: event.id,
    title: event.title,
    serveAt: event.serveAt,
    dishes: event.dishes,
    sections: event.sections,
    workflow: event.workflow,
    workflowDishesHash: event.workflowDishesHash,
  };
}

// Summarise freeform dietary text into an anonymised tag list before
// passing to an LLM. Use when the caller has a "notes" string that may
// contain guest names + dietary constraints — pass only the categories.
//
// Heuristic only: matches the obvious tokens. Anything not matched is
// dropped (fail-closed). For richer parsing, switch the caller to the
// structured `dietaryRequirements?` field on KitchenEvent (Tier 2 plan
// item; not implemented yet).
const DIETARY_TOKENS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bvegan\b/i, tag: 'vegan' },
  { pattern: /\bvegetarian\b/i, tag: 'vegetarian' },
  { pattern: /\bpescatarian\b/i, tag: 'pescatarian' },
  { pattern: /\bgluten[\s-]?free\b/i, tag: 'gluten-free' },
  { pattern: /\bdairy[\s-]?free\b|\blactose[\s-]?free\b/i, tag: 'dairy-free' },
  { pattern: /\bnut[\s-]?free\b|\bpeanut[\s-]?allerg/i, tag: 'nut-free' },
  { pattern: /\bshellfish[\s-]?(?:free|allerg)/i, tag: 'shellfish-free' },
  { pattern: /\bhalal\b/i, tag: 'halal' },
  { pattern: /\bkosher\b/i, tag: 'kosher' },
  { pattern: /\bketo\b|\bketogenic\b/i, tag: 'keto' },
  { pattern: /\blow[\s-]?(?:carb|sodium|fodmap)\b/i, tag: 'low-restriction' },
];

export function summarizeDietary(notes: string | undefined | null): string[] {
  if (!notes) return [];
  const tags = new Set<string>();
  for (const { pattern, tag } of DIETARY_TOKENS) {
    if (pattern.test(notes)) tags.add(tag);
  }
  return Array.from(tags).sort();
}
