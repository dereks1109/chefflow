// ---------------------------------------------------------------------------
// Defensive JSON-prep helper shared by every LLM consumer.
//
// Even with `response_format: { type: "json_object" }`, models occasionally
// wrap their JSON in markdown fences or preface it with prose ("Sure, here is
// the JSON:"). Strip the wrapping before JSON.parse so the caller's error
// path is reserved for genuinely malformed bodies.
// ---------------------------------------------------------------------------

export function stripMarkdownFences(s: string): string {
  let trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/, '')
      .trim();
  }
  if (!trimmed.startsWith('{')) {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      trimmed = trimmed.slice(first, last + 1);
    }
  }
  return trimmed;
}
