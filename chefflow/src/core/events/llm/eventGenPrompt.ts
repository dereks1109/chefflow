// ---------------------------------------------------------------------------
// Prompt builders for LLM-driven event extraction.
//
// User pastes a freeform block of text (an event invite, a brief, a meeting
// summary). The LLM extracts a structured KitchenEvent shell: title, time,
// location, combined notes/dietary string, and a dish list.
// ---------------------------------------------------------------------------

export function buildEventGenSystemPrompt(): string {
  return `You are an event extraction assistant for ChefFlow. Given a freeform block of text that describes a cooking / catering event, return a single JSON object describing the event. No prose, no markdown fences, no comments.

JSON SCHEMA:
{
  "title": "string — event title; pick a sensible default if not stated (e.g. \\"Untitled event\\")",
  "serveAt": "ISO 8601 datetime (e.g. \\"2026-06-12T19:30:00\\") — when the food is served. Use the supplied 'today' anchor to resolve relative dates like \\"Saturday\\" or \\"next Friday\\". Omit if you cannot determine a date confidently.",
  "location": "string — venue / address — omit if not stated",
  "notes": "string — combine general event notes AND dietary requirements into one block. Include guest counts, dietary types (vegan, vegetarian, halal, kosher), allergies, and any other context. Keep it concise (under ~300 chars).",
  "dishes": [
    {
      "name": "string — short dish name (e.g. \\"Beef Bourguignon\\")",
      "portions": <integer >= 1 — portions for this specific dish; default to the event's guest count if known, otherwise 4>,
      "startAt": "ISO datetime — when this dish should be served — optional; defaults to serveAt",
      "notes": "string — short note about the dish — optional"
    }
  ]
}

RULES:
- If a field cannot be confidently extracted, OMIT it (do not invent).
- "dishes" must always be an array; if no dishes are mentioned, return [].
- Combine ALL dietary information into "notes" — do not invent a separate dietary field.
- For "serveAt": always emit local-time ISO without a timezone suffix (the SPA renders in the user's local time).
- Title should be concise (under 60 chars).

Return ONLY the JSON object.`;
}

export interface EventGenUserPromptInput {
  text: string;
  /** ISO date string used as the anchor for relative-date resolution (e.g. "Saturday"). */
  todayIso: string;
}

export function buildEventGenUserPrompt({ text, todayIso }: EventGenUserPromptInput): string {
  return `Today is: ${todayIso}

Extract a ChefFlow event from the text below.

---
${text.trim()}
---

Return the event JSON.`;
}
