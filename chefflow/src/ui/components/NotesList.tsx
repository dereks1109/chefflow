// ---------------------------------------------------------------------------
// NotesList — render free-form notes as a bullet list.
//
// Chefs write notes in textareas; the canonical display is a list of points
// rather than a wall of text. Lines starting with `-`, `*`, or `•` get the
// prefix stripped so re-entering text round-trips cleanly. Empty input
// renders nothing; single-line input falls back to a plain paragraph so we
// don't surface a one-item bullet (visually noisy without payoff).
//
// Two popover modes:
//   - `notesOriginal` UNSET (chef typed notes manually): hover/focus shows
//     the per-line raw text. No surprises — what you see is what was typed.
//   - `notesOriginal` SET (came from an LLM extraction flow, e.g. the chef
//     pasted a customer email into GenerateEventSheet): hover/focus shows
//     the WHOLE original blob with the bullet's source line highlighted in
//     amber. Bullets with no match in the original carry a small "AI
//     paraphrase" badge so the chef can spot anything the LLM invented.
//     This is the provenance check — the chef can prove a bullet really
//     came from the customer rather than being synthesized.
// ---------------------------------------------------------------------------

interface Props {
  notes: string | undefined;
  /** Original unparsed text (e.g. the customer's email) when this event
   *  came from an LLM extraction flow. Empty / undefined → manual entry. */
  notesOriginal?: string;
  /** Extra Tailwind classes appended to the root element. */
  className?: string;
}

interface ParsedLine {
  /** Original line as the chef typed it (whitespace trimmed at edges, but
   *  the leading marker — `-`, `*`, `•` — is preserved so the popover can
   *  show "Original: '- Vegetarian guest'" verbatim). */
  raw: string;
  /** Display text with the leading marker stripped. */
  cleaned: string;
}

function parseLines(notes: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rawLine of notes.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    const cleaned = trimmed.replace(/^[-*•]\s*/, '').trim();
    if (cleaned.length === 0) continue;
    out.push({ raw: trimmed, cleaned });
  }
  return out;
}

/** Find the first case-insensitive substring index of needle in haystack.
 *  Returns -1 when no match. We require at least 6 characters of overlap
 *  to avoid spurious one-word hits (e.g. bullet "milk" matching the email
 *  signature "Yours, Camilk..."). For shorter bullets, fall back to a
 *  word-boundary match. */
function findSourceIndex(haystack: string, needle: string): number {
  const cleanedNeedle = needle.trim();
  if (cleanedNeedle.length === 0) return -1;
  const hLower = haystack.toLowerCase();
  const nLower = cleanedNeedle.toLowerCase();
  if (cleanedNeedle.length >= 6) {
    return hLower.indexOf(nLower);
  }
  // Short bullets — require a word-boundary match.
  const re = new RegExp(`\\b${nLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const m = re.exec(hLower);
  return m ? m.index : -1;
}

/** Render `original` with every line of `bullets` highlighted in amber.
 *  Lines that don't match are returned in plain text. Multiple bullets
 *  matching the same range produce a single combined highlight. */
function renderHighlightedOriginal(original: string, bullets: ParsedLine[]): React.ReactNode {
  // Compute matched ranges sorted + merged.
  const ranges: Array<[number, number]> = [];
  for (const b of bullets) {
    const idx = findSourceIndex(original, b.cleaned);
    if (idx < 0) continue;
    ranges.push([idx, idx + b.cleaned.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  if (merged.length === 0) {
    return <span className="opacity-80">{original}</span>;
  }
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i++) {
    const [s, e] = merged[i];
    if (s > cursor) {
      out.push(<span key={`p-${i}`} className="opacity-70">{original.slice(cursor, s)}</span>);
    }
    out.push(
      <mark key={`m-${i}`} className="bg-amber-300 dark:bg-amber-500 text-slate-900 dark:text-slate-900 rounded px-0.5">
        {original.slice(s, e)}
      </mark>,
    );
    cursor = e;
  }
  if (cursor < original.length) {
    out.push(<span key="tail" className="opacity-70">{original.slice(cursor)}</span>);
  }
  return out;
}

export default function NotesList({ notes, notesOriginal, className = '' }: Props) {
  if (!notes) return null;
  const lines = parseLines(notes);
  if (lines.length === 0) return null;
  const hasOriginal = typeof notesOriginal === 'string' && notesOriginal.trim().length > 0;
  if (lines.length === 1) {
    // Single-line: no popover needed — what you see is what was typed.
    return <p className={`whitespace-pre-wrap ${className}`}>{lines[0].cleaned}</p>;
  }
  return (
    <ul className={`list-disc list-inside space-y-0.5 ${className}`} data-testid="notes-list">
      {lines.map((line, i) => {
        const matchedIdx = hasOriginal ? findSourceIndex(notesOriginal!, line.cleaned) : -1;
        const isParaphrase = hasOriginal && matchedIdx < 0;
        return (
          <li
            key={i}
            tabIndex={0}
            data-testid={`notes-list-item-${i}`}
            data-paraphrase={isParaphrase ? 'true' : 'false'}
            className={[
              'relative group rounded px-1 -mx-1 cursor-default',
              'transition-colors duration-100',
              // Visible in-list tint for AI-paraphrased bullets (2026-05-28).
              // Standalone visual cue alongside the existing 'AI paraphrase'
              // badge so the chef can scan the list without hovering each
              // bullet. The hover-amber bg below overrides this on
              // interaction so the hover-trigger stays consistent.
              isParaphrase
                ? 'bg-purple-50 dark:bg-purple-900/15 border-l-2 border-purple-300 dark:border-purple-700 pl-2'
                : '',
              'hover:bg-amber-100 dark:hover:bg-amber-900/30',
              'focus:bg-amber-100 dark:focus:bg-amber-900/30',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
            ].join(' ')}
          >
            {line.cleaned}
            {isParaphrase && (
              <span
                data-testid={`notes-list-paraphrase-${i}`}
                title="Not found verbatim in the source — paraphrased by AI"
                className="ml-1 inline-flex items-center rounded px-1 py-0 text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200"
              >
                AI paraphrase
              </span>
            )}
            <span
              role="tooltip"
              data-testid={`notes-list-original-${i}`}
              className={[
                'absolute z-10 bottom-full left-0 mb-1',
                hasOriginal
                  ? 'px-2 py-1.5 rounded-md bg-slate-900 text-amber-50 text-[11px] leading-snug shadow-lg w-[28rem] max-w-[90vw] max-h-72 overflow-auto'
                  : 'px-2 py-1 rounded-md bg-slate-900 text-amber-100 text-[11px] leading-snug shadow-lg max-w-[24rem]',
                'font-mono whitespace-pre-wrap',
                'transition-opacity duration-150',
                'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none',
              ].join(' ')}
            >
              <span className="block opacity-70 text-[10px] uppercase tracking-wide font-sans mb-1">
                {hasOriginal ? 'Source — customer text (highlighted = this bullet)' : 'Original'}
              </span>
              {hasOriginal
                ? renderHighlightedOriginal(notesOriginal!, [line])
                : line.raw}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
