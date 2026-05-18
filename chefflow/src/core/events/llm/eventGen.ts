// ---------------------------------------------------------------------------
// Orchestrator for LLM-driven event extraction.
//
// Takes a freeform text block, asks the LLM to produce a KitchenEvent shell
// (title + time + location + notes + dishes), and hydrates it into the
// domain shape (minting ids, defaulting timestamps).
// ---------------------------------------------------------------------------

import type { KitchenEvent, Dish } from '../../types';
import { randomId } from '../../util/id';
import { complete } from '../../llm/llmClient';
import { stripMarkdownFences } from '../../llm/stripMarkdownFences';
import {
  buildEventGenSystemPrompt,
  buildEventGenUserPrompt,
} from './eventGenPrompt';

export class EventGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventGenError';
  }
}

export interface GenerateEventInput {
  text: string;
  apiKey: string;
  model: string;
  todayIso?: string;            // override for tests; defaults to new Date().toISOString().slice(0, 10)
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function generateEventFromText(input: GenerateEventInput): Promise<KitchenEvent> {
  if (input.text.trim().length === 0) {
    throw new EventGenError('No text provided.');
  }
  const todayIso = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const systemPrompt = buildEventGenSystemPrompt();
  const userPrompt = buildEventGenUserPrompt({ text: input.text, todayIso });
  const raw = await complete({
    endpoint: 'generate',
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt,
    userPrompt,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  return parseLlmEvent(raw);
}

// ---------------------------------------------------------------------------
// Lenient parser. Tolerates fences + stray prose around the JSON body.
// Missing fields default to safe values; unknown extras are ignored.
// ---------------------------------------------------------------------------
export function parseLlmEvent(raw: string): KitchenEvent {
  const stripped = stripMarkdownFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new EventGenError(`LLM did not return valid JSON: ${msg}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new EventGenError('LLM response is not a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  const title = typeof o.title === 'string' && o.title.trim().length > 0
    ? o.title.trim()
    : 'Untitled event';
  const serveAt = typeof o.serveAt === 'string' && o.serveAt.trim().length > 0
    ? o.serveAt.trim()
    : undefined;
  const location = typeof o.location === 'string' && o.location.trim().length > 0
    ? o.location.trim()
    : undefined;
  const notes = typeof o.notes === 'string' ? o.notes.trim() : '';
  const dishes = parseDishes(o.dishes, serveAt);

  const now = Date.now();
  return {
    id: randomId(),
    title,
    serveAt,
    location,
    notes,
    dishes,
    createdAt: now,
    updatedAt: now,
  };
}

function parseDishes(v: unknown, eventServeAt: string | undefined): Dish[] {
  if (!Array.isArray(v)) return [];
  const out: Dish[] = [];
  v.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) return;
    const d = item as Record<string, unknown>;
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) return;
    const portions = typeof d.portions === 'number' && Number.isFinite(d.portions) && d.portions >= 1
      ? Math.floor(d.portions)
      : 4;
    const startAt = typeof d.startAt === 'string' && d.startAt.trim().length > 0
      ? d.startAt.trim()
      : (eventServeAt ?? new Date().toISOString());
    const notes = typeof d.notes === 'string' && d.notes.trim().length > 0
      ? d.notes.trim()
      : undefined;
    out.push({
      id: `d${idx + 1}`,
      name,
      portions,
      startAt,
      notes,
    });
  });
  return out;
}

