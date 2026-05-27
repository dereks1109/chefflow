// ---------------------------------------------------------------------------
// Orchestrator for the LLM-driven menu-suitability check.
//
// Given an event (with its freeform dietary requirements + dish list) and a
// lookup of any linked recipes, asks the LLM whether the menu suits the
// declared guests and parses the structured verdict.
// ---------------------------------------------------------------------------

import type {
  KitchenEvent,
  MenuAnalysis,
  MenuIssue,
  MenuIssueSeverity,
  MenuSuggestion,
  MenuSuggestionCategory,
  Recipe,
} from '../../types';
import { complete } from '../../llm/llmClient';
import { stripMarkdownFences } from '../../llm/stripMarkdownFences';
import {
  buildMenuCheckSystemPrompt,
  buildMenuCheckUserPrompt,
} from './menuCheckPrompt';

export class MenuCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuCheckError';
  }
}

export interface CheckMenuInput {
  event: KitchenEvent;
  /** Linked recipes keyed by id. Pass {} if none are linked. */
  recipes: Record<string, Recipe>;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Sum of priced dishes for the event (recipe.pricePerPortion × dish.portions).
 * Returns undefined when no linked dish has a price — the prompt then omits
 * the budget section entirely.
 */
function computeTotalCost(
  event: KitchenEvent,
  recipes: Record<string, Recipe>,
): number | undefined {
  let total = 0;
  let anyPriced = false;
  for (const d of event.dishes) {
    if (!d.recipeId) continue;
    const r = recipes[d.recipeId];
    const perPortion = r?.pricePerPortion;
    if (perPortion === undefined) continue;
    anyPriced = true;
    total += perPortion * d.portions;
  }
  return anyPriced ? total : undefined;
}

export async function checkMenu(input: CheckMenuInput): Promise<MenuAnalysis> {
  // 2026-05-28: allergens + keyIngredients no longer fed to the LLM. The
  // menu suitability check reasons about DIETARY PREFERENCES only (vegan,
  // vegetarian, halal, kosher, religious / cultural). Allergen analysis
  // is the chef's per-recipe responsibility — see AllergensSection.
  const dishes = input.event.dishes.map((d) => ({
    name: d.name,
    portions: d.portions,
  }));

  const systemPrompt = buildMenuCheckSystemPrompt();
  const userPrompt = buildMenuCheckUserPrompt({
    dietaryRequirements: input.event.notes ?? '',
    dishes,
    budget: input.event.budget,
    totalCost: computeTotalCost(input.event, input.recipes),
  });

  const raw = await complete({
    endpoint: 'analyze',
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt,
    userPrompt,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });

  return parseMenuAnalysis(raw);
}

// ---------------------------------------------------------------------------
// Lenient JSON parser. Mirrors the recipeGen tolerance for markdown fences
// and stray prose around the JSON body.
// ---------------------------------------------------------------------------
export function parseMenuAnalysis(raw: string): MenuAnalysis {
  const stripped = stripMarkdownFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MenuCheckError(`LLM did not return valid JSON: ${msg}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new MenuCheckError('LLM response is not a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  return {
    verdict: parseVerdict(o.verdict),
    issues: parseIssues(o.issues),
    suggestions: parseSuggestions(o.suggestions),
    analyzedAt: Date.now(),
  };
}

function parseVerdict(v: unknown): MenuAnalysis['verdict'] {
  if (v === 'ok' || v === 'warnings' || v === 'blocked') return v;
  // Safe-ish default: surface as warnings so the chef looks at the result
  // rather than silently treating an unparsable verdict as fine.
  return 'warnings';
}

function parseIssues(v: unknown): MenuIssue[] {
  if (!Array.isArray(v)) return [];
  const out: MenuIssue[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const message = typeof o.message === 'string' ? o.message.trim() : '';
    if (!message) continue;
    const severity: MenuIssueSeverity = o.severity === 'blocker' ? 'blocker' : 'warning';
    out.push({ severity, message });
  }
  return out;
}

const REQUIRED_SUGGESTIONS = 5;

/**
 * Parse the LLM's `suggestions` array into MenuSuggestion[]. Tolerates:
 *  - new shape: [{ category, text }]
 *  - legacy shape: ["string"] — coerced to category 'other'
 *  - empty / invalid — discards malformed entries
 * Always returns exactly REQUIRED_SUGGESTIONS entries: slices if more,
 * pads with neutral 'other' placeholders if fewer.
 */
function parseSuggestions(v: unknown): MenuSuggestion[] {
  const collected: MenuSuggestion[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === 'string') {
        const text = item.trim();
        if (text) collected.push({ category: 'other', text });
        continue;
      }
      if (typeof item !== 'object' || item === null) continue;
      const o = item as Record<string, unknown>;
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (!text) continue;
      collected.push({ category: parseSuggestionCategory(o.category), text });
    }
  }
  if (collected.length >= REQUIRED_SUGGESTIONS) {
    return collected.slice(0, REQUIRED_SUGGESTIONS);
  }
  // Pad with neutral entries so the UI always renders exactly 5 slots.
  while (collected.length < REQUIRED_SUGGESTIONS) {
    collected.push({
      category: 'other',
      text: 'No further suggestion — the LLM returned fewer than 5 ideas.',
    });
  }
  return collected;
}

function parseSuggestionCategory(v: unknown): MenuSuggestionCategory {
  if (v === 'allergy' || v === 'budget' || v === 'other') return v;
  return 'other';
}
