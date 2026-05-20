// ---------------------------------------------------------------------------
// NotesList — render free-form notes as a bullet list.
//
// Chefs write notes in textareas; the canonical display is a list of points
// rather than a wall of text. Lines starting with `-`, `*`, or `•` get the
// prefix stripped so re-entering text round-trips cleanly. Empty input
// renders nothing; single-line input falls back to a plain paragraph so we
// don't surface a one-item bullet (visually noisy without payoff).
// ---------------------------------------------------------------------------

interface Props {
  notes: string | undefined;
  /** Extra Tailwind classes appended to the root element. */
  className?: string;
}

export default function NotesList({ notes, className = '' }: Props) {
  if (!notes) return null;
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;
  if (lines.length === 1) {
    return <p className={`whitespace-pre-wrap ${className}`}>{lines[0]}</p>;
  }
  return (
    <ul className={`list-disc list-inside space-y-0.5 ${className}`}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
