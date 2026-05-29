// Static keyword scanner for spotting allergy / intolerance mentions in
// a customer's raw text (e.g. an event brief pasted into
// GenerateEventSheet). Deliberately NOT an AI step — keeps the safety
// posture honest and predictable: the scanner only highlights words the
// chef or product team has explicitly listed.
//
// The default list is non-removable (chef can add to it via
// `useAllergyKeywordsStore` but never strip a default — defaults are
// the safety baseline). Adds are de-duped, trimmed, lowercased.
//
// Matcher semantics:
//   - Case-insensitive.
//   - Single-word keywords match on word boundaries ("no" matches "no
//     nuts" but NOT "ignore").
//   - Multi-word phrases match as substrings on word boundaries at the
//     edges (so "no gluten" matches "say no gluten products" but not
//     "no glutening" — phrase scan with leading/trailing \b).
//   - Overlapping matches are merged (one wins) so the popover doesn't
//     render double-wrapped <mark>s.

export const DEFAULT_ALLERGY_KEYWORDS: readonly string[] = [
  // ---- Mandatory UK-14 allergens + common specifics --------------------
  'celery',
  'gluten',
  'wheat', 'rye', 'barley', 'oats',
  'crustacean', 'crustaceans', 'prawn', 'prawns', 'crab', 'lobster',
  'egg', 'eggs',
  'fish',
  'lupin',
  'milk', 'dairy',
  'mollusc', 'molluscs', 'mussel', 'mussels', 'oyster', 'oysters', 'squid',
  'mustard',
  'nut', 'nuts',
  'almond', 'almonds', 'hazelnut', 'hazelnuts',
  'walnut', 'walnuts', 'cashew', 'cashews', 'pecan', 'pecans',
  'brazil', 'pistachio', 'pistachios', 'macadamia', 'macadamias',
  'peanut', 'peanuts',
  'sesame',
  'soya', 'soy', 'soybean', 'soybeans',
  'sulphite', 'sulphites', 'sulphur', 'sulfite', 'sulfites',
  // ---- Dietary & religious ---------------------------------------------
  'halal', 'haram', 'kosher',
  'vegan', 'vegetarian', 'plant-based',
  'pork', 'alcohol', 'gelatine', 'gelatin', 'rennet',
  // ---- Logic, Negation & Requests --------------------------------------
  // "no" / "not" highlight on their own — paired with food words by the
  // chef's eye, not by the matcher. The risk of false positives ("no
  // problem") is acceptable for safety-critical scanning. Request verbs
  // (request/prefer/ask/require/insist/please) light up the polite
  // scaffolding around the actual constraint so the chef can see it at
  // a glance instead of reading the whole email.
  'no', 'not', 'avoid', 'never', 'zero', 'without', 'free', 'except',
  'must', 'have to', 'prohibited',
  'request', 'requested', 'prefer', 'preferred', 'preference',
  'ask', 'asked', 'require', 'required', 'requirement',
  'demand', 'insist', 'exclude', 'excluded',
  'instead', 'alternative', 'option', 'please',
  // ---- Risk & urgency --------------------------------------------------
  'anaphylaxis', 'anaphylactic', 'epipen', 'adrenaline',
  'allergy', 'allergic', 'allergies',
  'reaction', 'intolerant', 'intolerance', 'sensitivity', 'severe', 'warning',
  // ---- Common typos & misspellings ------------------------------------
  // Customer-side fat-fingers / phonetic spellings of the most safety-
  // critical allergens, gathered 2026-05-29 from an NLP review. The
  // matcher is exact text-search only — without these, "no peenut
  // please" silently passes through. Excludes real English words
  // (e.g. "salary" for "celery") to avoid silent false positives;
  // those can be added per-chef via the custom-keywords UI.
  // dairy
  'diary', 'daiery', 'dayri', 'dary', 'dairi',
  // peanut / peanuts
  'peenut', 'peenuts', 'peanutt', 'peanot', 'peaunt', 'penut', 'penuts',
  'pnut', 'pnuts', 'peanunts', 'peannuts',
  // nuts / tree nuts
  'nutts', 'nutz', 'treenut', 'treenuts', 'tree-nut', 'tree-nuts',
  // gluten
  'glutten', 'glutin', 'glooten', 'glueten', 'gluen', 'glutton', 'gltn',
  // wheat
  'weat', 'wheet', 'whet', 'wheats', 'weath',
  // sesame
  'sesami', 'sesamy', 'seseme', 'sezame', 'sasame', 'sesmae',
  // celery
  'celary', 'cellery', 'celerie', 'sellery', 'cellary',
  // request
  'requst', 'reqeust', 'reqest', 'requets', 'rquest', 'requeest', 'requestt',
] as const;

export interface KeywordMatch {
  /** The matched keyword (lowercased, as stored in the list). */
  keyword: string;
  /** Index in haystack where the match starts. */
  start: number;
  /** Index in haystack one past where the match ends. */
  end: number;
}

// Cache one lowercased default set so we can de-dupe additions without
// re-allocating each call. (Chef-supplied extras live in the
// `useAllergyKeywordsStore` already.)
const DEFAULT_SET = new Set(DEFAULT_ALLERGY_KEYWORDS.map((k) => k.toLowerCase()));

/** Returns the default keywords as a stable lowercased array. */
export function defaultAllergyKeywords(): string[] {
  return Array.from(DEFAULT_SET);
}

/** True if `word` is a default keyword (case-insensitive). */
export function isDefaultAllergyKeyword(word: string): boolean {
  return DEFAULT_SET.has(word.trim().toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find every allergy-keyword occurrence in `text`. Merges overlapping
 *  matches so the popover never double-wraps a character. */
export function findAllergyKeywords(
  text: string,
  extraKeywords: readonly string[] = [],
): KeywordMatch[] {
  if (!text) return [];
  const haystack = text;
  const lower = haystack.toLowerCase();
  const seen = new Set<string>();
  const all: string[] = [];
  for (const k of [...DEFAULT_ALLERGY_KEYWORDS, ...extraKeywords]) {
    const norm = k.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    all.push(norm);
  }
  // Sort longest-first so multi-word phrases win over their single-word
  // prefixes when merging overlaps.
  all.sort((a, b) => b.length - a.length);

  const raw: KeywordMatch[] = [];
  for (const k of all) {
    const re = new RegExp(`\\b${escapeRegex(k)}\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      raw.push({ keyword: k, start: m.index, end: m.index + k.length });
      // Avoid zero-width infinite loops on empty patterns.
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }

  // Sort by start, then merge overlaps (longer keyword wins because of
  // the longest-first scan order above).
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: KeywordMatch[] = [];
  for (const m of raw) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) {
      // Overlap → keep the longer / earlier match (already preferred
      // by the sort order).
      continue;
    }
    merged.push(m);
  }
  return merged;
}
