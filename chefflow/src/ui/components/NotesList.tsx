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
//
// Allergy-keyword highlight (2026-05-28): when the popover renders the
// original blob, any occurrence of an allergy keyword (from the default
// list + chef's extras in `useAllergyKeywordsStore`) is wrapped in a RED
// <mark> on top of the existing amber bullet-source highlight. On overlap
// allergy wins (safety-critical).
// ---------------------------------------------------------------------------

import { findAllergyKeywords } from '../../core/events/allergyKeywords';
import { useAllergyKeywordsStore } from '../../state/useAllergyKeywordsStore';

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

type HighlightKind = 'bullet' | 'allergy' | 'paraphrase-source';

interface RangedHighlight {
  start: number;
  end: number;
  kind: HighlightKind;
}

/** Split `original` into sentence ranges by `.`, `!`, `?` boundaries
 *  AND newlines. Empty / whitespace-only ranges are dropped. Used by
 *  the paraphrase-source highlighter — when at least one bullet was
 *  paraphrased, every source sentence NOT covered by a matched bullet
 *  range is flagged as "this is the part of the email the LLM was
 *  likely synthesising from". */
function sentenceRanges(original: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const re = /[.!?]+\s+|\n+/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(original)) !== null) {
    const end = m.index + m[0].length;
    const slice = original.slice(lastEnd, end);
    if (slice.trim().length > 0) {
      out.push({ start: lastEnd, end });
    }
    lastEnd = end;
  }
  if (lastEnd < original.length) {
    const slice = original.slice(lastEnd, original.length);
    if (slice.trim().length > 0) out.push({ start: lastEnd, end: original.length });
  }
  return out;
}

// Stopwords screened out of the paraphrase-source token-overlap match
// so a bullet like "Three vegans guests" doesn't get matched to a
// sentence on the strength of "have" / "the" alone. Conservative list
// — only words that show up everywhere in customer emails.
const PARAPHRASE_MATCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'for', 'in', 'on',
  'with', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'we', 'us',
  'our', 'my', 'me', 'you', 'your', 'i', 'it', 'this', 'that', 'these',
  'those', 'have', 'has', 'had', 'will', 'can', 'could', 'would',
  'should', 'please', 'also', 'hi', 'hello', 'chef', 'thanks', 'thank',
]);

function tokenizeForMatch(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length < 3) continue;
    if (PARAPHRASE_MATCH_STOPWORDS.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

/** Find the SINGLE source sentence with the highest token-overlap
 *  (Jaccard) with the paraphrased bullet text. Returns null when no
 *  sentence is similar enough to be considered the LLM's source.
 *
 *  Replaces the prior "mark every uncovered sentence" approach which
 *  lit up the entire email when ALL bullets were paraphrased (because
 *  every sentence was technically "not verbatim-covered"). Now we mark
 *  at most ONE sentence per paraphrased bullet — the chef sees exactly
 *  the line of the email the LLM was paraphrasing from, not a sea of
 *  purple.
 *
 *  Threshold (0.15 Jaccard with ≥1 shared content token) is
 *  conservative: prefers false negatives (no purple mark) over false
 *  positives (purple on a sentence that wasn't actually the source). */
function bestParaphraseSourceSentence(
  bulletText: string,
  original: string,
  sentences: ReadonlyArray<{ start: number; end: number }>,
): { start: number; end: number } | null {
  const bulletTokens = tokenizeForMatch(bulletText);
  if (bulletTokens.size === 0) return null;
  let best: { idx: number; score: number } | null = null;
  for (let i = 0; i < sentences.length; i++) {
    const sentenceText = original.slice(sentences[i].start, sentences[i].end);
    const sentenceTokens = tokenizeForMatch(sentenceText);
    if (sentenceTokens.size === 0) continue;
    let intersection = 0;
    for (const t of bulletTokens) {
      if (sentenceTokens.has(t)) intersection++;
    }
    if (intersection === 0) continue;
    const union = bulletTokens.size + sentenceTokens.size - intersection;
    const score = intersection / union;
    if (!best || score > best.score) best = { idx: i, score };
  }
  if (!best || best.score < 0.15) return null;
  return sentences[best.idx];
}

/** Render `original` with the hovered bullet's source range in amber,
 *  allergy-keyword ranges in red, AND the precomputed paraphrase-source
 *  sentences in purple. Overlap precedence: allergy > paraphrase-source
 *  > bullet > plain. */
function renderHighlightedOriginal(
  original: string,
  hoveredBullets: ParsedLine[],
  allergyMatches: ReadonlyArray<{ start: number; end: number }> = [],
  paraphraseSourceRanges: ReadonlyArray<{ start: number; end: number }> = [],
): React.ReactNode {
  const ranges: RangedHighlight[] = [];
  // The HOVERED bullet's source range (amber). Only the bullet whose
  // popover this is — never the global list.
  for (const b of hoveredBullets) {
    const idx = findSourceIndex(original, b.cleaned);
    if (idx < 0) continue;
    ranges.push({ start: idx, end: idx + b.cleaned.length, kind: 'bullet' });
  }
  // Paraphrase-source sentences (purple) — precomputed.
  for (const s of paraphraseSourceRanges) {
    ranges.push({ start: s.start, end: s.end, kind: 'paraphrase-source' });
  }
  // Allergy keywords (red — safety-critical, wins overlap).
  for (const m of allergyMatches) {
    ranges.push({ start: m.start, end: m.end, kind: 'allergy' });
  }

  if (ranges.length === 0) {
    return <span className="opacity-80">{original}</span>;
  }

  // Resolve conflicts character-by-character.
  // Precedence: allergy > paraphrase-source > bullet > plain.
  const winnerAt: Array<HighlightKind | null> = new Array(original.length).fill(null);
  const PRECEDENCE: Record<HighlightKind, number> = {
    allergy: 3,
    'paraphrase-source': 2,
    bullet: 1,
  };
  for (const r of ranges) {
    for (let i = r.start; i < Math.min(r.end, original.length); i++) {
      const current = winnerAt[i];
      if (current === null || PRECEDENCE[r.kind] > PRECEDENCE[current]) {
        winnerAt[i] = r.kind;
      }
    }
  }

  const out: React.ReactNode[] = [];
  let cursor = 0;
  let segStart = 0;
  let segKind: HighlightKind | null = winnerAt[0] ?? null;
  function flushSegment(end: number, key: string) {
    if (end <= segStart) return;
    const slice = original.slice(segStart, end);
    if (segKind === 'allergy') {
      out.push(
        <mark
          key={key}
          data-testid="notes-list-allergy-mark"
          data-allergy="true"
          className="bg-red-300 dark:bg-red-500 text-slate-900 dark:text-slate-900 rounded px-0.5"
        >
          {slice}
        </mark>,
      );
    } else if (segKind === 'paraphrase-source') {
      out.push(
        <mark
          key={key}
          data-testid="notes-list-paraphrase-source-mark"
          data-paraphrase-source="true"
          className="bg-purple-200 dark:bg-purple-700/60 text-slate-900 dark:text-slate-100 rounded px-0.5"
        >
          {slice}
        </mark>,
      );
    } else if (segKind === 'bullet') {
      out.push(
        <mark key={key} className="bg-amber-300 dark:bg-amber-500 text-slate-900 dark:text-slate-900 rounded px-0.5">
          {slice}
        </mark>,
      );
    } else {
      out.push(
        <span key={key} className="opacity-70">{slice}</span>,
      );
    }
  }
  for (let i = 1; i < original.length; i++) {
    const k = winnerAt[i] ?? null;
    if (k !== segKind) {
      flushSegment(i, `seg-${cursor++}`);
      segStart = i;
      segKind = k;
    }
  }
  flushSegment(original.length, `seg-${cursor++}`);
  return out;
}

export default function NotesList({ notes, notesOriginal, className = '' }: Props) {
  const extras = useAllergyKeywordsStore((s) => s.extras);
  if (!notes) return null;
  const lines = parseLines(notes);
  if (lines.length === 0) return null;
  const hasOriginal = typeof notesOriginal === 'string' && notesOriginal.trim().length > 0;
  // Scan the original blob (or the parsed notes when there's no original)
  // for allergy keywords. The matches feed into renderHighlightedOriginal
  // for the popover overlay; EventDetailCard runs a separate scan to
  // populate the banner count.
  const allergyMatches = hasOriginal ? findAllergyKeywords(notesOriginal!, extras) : [];
  // Sentence ranges of the source — used per-bullet below to find the
  // single best-matching source sentence for each paraphrased bullet.
  const sourceSentences = hasOriginal ? sentenceRanges(notesOriginal!) : [];
  if (lines.length === 1) {
    // Single-line: no popover needed — what you see is what was typed.
    return <p className={`whitespace-pre-wrap ${className}`}>{lines[0].cleaned}</p>;
  }
  return (
    <ul className={`list-disc list-inside space-y-0.5 ${className}`} data-testid="notes-list">
      {lines.map((line, i) => {
        const matchedIdx = hasOriginal ? findSourceIndex(notesOriginal!, line.cleaned) : -1;
        const isParaphrase = hasOriginal && matchedIdx < 0;
        // Per-bullet purple range: the single source sentence the LLM
        // most likely paraphrased FROM. Only computed for paraphrased
        // bullets so verbatim-matched bullets' popovers stay amber-
        // only.
        const paraphraseSourceForThisBullet =
          isParaphrase && hasOriginal
            ? bestParaphraseSourceSentence(line.cleaned, notesOriginal!, sourceSentences)
            : null;
        const paraphraseSourceRanges = paraphraseSourceForThisBullet
          ? [paraphraseSourceForThisBullet]
          : [];
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
                ? renderHighlightedOriginal(notesOriginal!, [line], allergyMatches, paraphraseSourceRanges)
                : line.raw}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
