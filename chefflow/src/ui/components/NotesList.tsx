// ---------------------------------------------------------------------------
// NotesList — render free-form notes as a bullet list.
//
// Chefs write notes in textareas; the canonical display is a list of points
// rather than a wall of text. Lines starting with `-`, `*`, or `•` get the
// prefix stripped so re-entering text round-trips cleanly. Empty input
// renders nothing; single-line input falls back to a plain paragraph so we
// don't surface a one-item bullet (visually noisy without payoff).
//
// Each bullet keeps a pointer to its raw original line (including any
// leading marker). On hover/focus, the bullet gets an amber background AND
// shows the raw line in a small popover above it — chefs can confirm the
// parser hasn't munged what the client wrote.
// ---------------------------------------------------------------------------

interface Props {
  notes: string | undefined;
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

export default function NotesList({ notes, className = '' }: Props) {
  if (!notes) return null;
  const lines = parseLines(notes);
  if (lines.length === 0) return null;
  if (lines.length === 1) {
    // Single-line: no popover needed — what you see is what was typed.
    return <p className={`whitespace-pre-wrap ${className}`}>{lines[0].cleaned}</p>;
  }
  return (
    <ul className={`list-disc list-inside space-y-0.5 ${className}`} data-testid="notes-list">
      {lines.map((line, i) => (
        <li
          key={i}
          tabIndex={0}
          data-testid={`notes-list-item-${i}`}
          className={[
            'relative group rounded px-1 -mx-1 cursor-default',
            'transition-colors duration-100',
            'hover:bg-amber-100 dark:hover:bg-amber-900/30',
            'focus:bg-amber-100 dark:focus:bg-amber-900/30',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
          ].join(' ')}
        >
          {line.cleaned}
          <span
            role="tooltip"
            data-testid={`notes-list-original-${i}`}
            className={[
              'absolute z-10 bottom-full left-0 mb-1',
              'px-2 py-1 rounded-md bg-slate-900 text-amber-100 text-[11px] leading-snug shadow-lg',
              'font-mono whitespace-pre-wrap max-w-[24rem]',
              'transition-opacity duration-150',
              'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none',
            ].join(' ')}
          >
            <span className="block opacity-70 text-[10px] uppercase tracking-wide font-sans">Original</span>
            {line.raw}
          </span>
        </li>
      ))}
    </ul>
  );
}
