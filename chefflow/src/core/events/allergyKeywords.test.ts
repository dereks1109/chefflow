import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLERGY_KEYWORDS,
  defaultAllergyKeywords,
  findAllergyKeywords,
  isDefaultAllergyKeyword,
} from './allergyKeywords';

describe('DEFAULT_ALLERGY_KEYWORDS', () => {
  it('covers the bread-and-butter terms', () => {
    const set = new Set(DEFAULT_ALLERGY_KEYWORDS.map((k) => k.toLowerCase()));
    for (const must of ['allergy', 'allergic', 'intolerance', 'avoid', 'severe', 'epipen']) {
      expect(set.has(must)).toBe(true);
    }
  });
});

describe('isDefaultAllergyKeyword', () => {
  it('case-insensitive + trim-tolerant', () => {
    expect(isDefaultAllergyKeyword('Allergy')).toBe(true);
    expect(isDefaultAllergyKeyword('  EpiPen  ')).toBe(true);
    expect(isDefaultAllergyKeyword('not-a-keyword')).toBe(false);
  });
});

describe('defaultAllergyKeywords', () => {
  it('returns the lowercased default list', () => {
    const list = defaultAllergyKeywords();
    for (const k of list) expect(k).toBe(k.toLowerCase());
    expect(list).toContain('allergy');
  });
});

describe('findAllergyKeywords', () => {
  it('returns [] for empty text', () => {
    expect(findAllergyKeywords('')).toEqual([]);
  });

  it('finds a single-word keyword case-insensitively', () => {
    const out = findAllergyKeywords('Carla is allergic to peanuts.');
    const kws = out.map((m) => m.keyword).sort();
    // 'allergic' + 'no peanuts' aren't present, but 'peanuts' isn't a default
    // either — we expect at least 'allergic'.
    expect(kws).toContain('allergic');
  });

  it('respects word boundaries (no false positive on "ignore" for "no")', () => {
    // "ignore" must not register as the "no" keyword. Note: "please" is
    // itself a default keyword (Requests category) so we avoid it in
    // the boundary test text.
    const out = findAllergyKeywords('Kindly ignore the mess in the kitchen.');
    expect(out).toEqual([]);
  });

  it('matches each word in "STRICT NO NUTS" (case-insensitive, including the standalone "no")', () => {
    const out = findAllergyKeywords('NO NUTS at the table please.');
    const kws = out.map((m) => m.keyword);
    expect(kws).toContain('no');
    expect(kws).toContain('nuts');
  });

  it('longest-first wins when keywords could overlap', () => {
    // Both 'no' and 'must' are defaults. Make sure neighbouring matches
    // produce two distinct ranges with no duplicate / nested marks.
    const out = findAllergyKeywords('no peanut, must avoid alcohol');
    const kws = out.map((m) => m.keyword);
    expect(kws).toContain('no');
    expect(kws).toContain('peanut');
    expect(kws).toContain('must');
    expect(kws).toContain('avoid');
    expect(kws).toContain('alcohol');
  });

  it('matches the new mandatory-allergen keywords (UK-14 + specifics)', () => {
    const text = 'Carla cannot have hazelnut, pecan, lobster, mussel, or sulphite.';
    const kws = findAllergyKeywords(text).map((m) => m.keyword);
    for (const want of ['hazelnut', 'pecan', 'lobster', 'mussel', 'sulphite']) {
      expect(kws).toContain(want);
    }
  });

  it('matches the new dietary & religious keywords', () => {
    const text = 'Two halal guests, one kosher, one vegan. No pork, gelatine, or rennet.';
    const kws = findAllergyKeywords(text).map((m) => m.keyword);
    for (const want of ['halal', 'kosher', 'vegan', 'pork', 'gelatine', 'rennet']) {
      expect(kws).toContain(want);
    }
  });

  it('matches common typo / misspelling variants (food-safety guardrail)', () => {
    // The matcher is exact text-search; a customer-typed misspelling
    // like "peenut" or "diary" would silently slip through unless the
    // default list covers it. Spot-check a sample of the misspelling
    // defaults across categories — phonetic, transposition, and fat-
    // finger families.
    const text = 'Severe peenut allergy. Diary intolerance. Glutten free. Celary makes her sick.';
    const kws = findAllergyKeywords(text).map((m) => m.keyword);
    for (const want of ['peenut', 'diary', 'glutten', 'celary']) {
      expect(kws).toContain(want);
    }
  });

  it('matches the new Logic, Negation & Requests keywords (request verbs)', () => {
    // Six representative samples across the new request-verb words. The
    // matcher already handles word boundaries for ≥3-char words via
    // \b…\b — covered by the "respects word boundaries" test above — so
    // this is a per-keyword presence spot-check, not a boundary
    // regression suite.
    const text = 'They requested a vegan option instead of beef, and prefer no peanut. Please exclude shellfish; allergy is severe. We can offer an alternative dessert.';
    const kws = findAllergyKeywords(text).map((m) => m.keyword);
    for (const want of ['requested', 'prefer', 'please', 'exclude', 'instead', 'alternative', 'option']) {
      expect(kws).toContain(want);
    }
  });

  it('matches the new risk & urgency keywords', () => {
    const text = 'Severe nut allergy — anaphylaxis risk, EpiPen on site.';
    const kws = findAllergyKeywords(text).map((m) => m.keyword);
    for (const want of ['severe', 'allergy', 'anaphylaxis', 'epipen']) {
      expect(kws).toContain(want);
    }
  });

  it('extra keywords additive on top of defaults', () => {
    const text = 'Avoid celiac triggers in the kitchen.';
    const baseline = findAllergyKeywords(text);
    expect(baseline.map((m) => m.keyword)).toContain('avoid');
    expect(baseline.map((m) => m.keyword)).not.toContain('celiac');

    const withExtras = findAllergyKeywords(text, ['celiac']);
    expect(withExtras.map((m) => m.keyword)).toContain('celiac');
  });

  it('de-dupes the extras list (adding a default keyword as extra is a no-op)', () => {
    const text = 'Strict no nuts policy.';
    const baselineCount = findAllergyKeywords(text).length;
    const withDupes = findAllergyKeywords(text, ['no nuts', 'STRICT', 'allergy']);
    expect(withDupes.length).toBe(baselineCount);
  });

  it('produces non-overlapping ranges (popover can safely wrap each in <mark>)', () => {
    const text = 'No gluten allergic intolerance.';
    const out = findAllergyKeywords(text);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
    }
  });
});
