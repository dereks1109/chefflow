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
    const out = findAllergyKeywords('Please ignore the mess in the kitchen.');
    expect(out).toEqual([]);
  });

  it('matches multi-word phrases like "no nuts"', () => {
    const out = findAllergyKeywords('Strict NO NUTS at the table please.');
    const kws = out.map((m) => m.keyword);
    expect(kws).toContain('no nuts');
    expect(kws).toContain('strict');
  });

  it('multi-word phrase wins over its single-word prefix (longest-first overlap)', () => {
    // 'no' isn't a default but 'no gluten' is — the matcher should produce
    // ONE match for 'no gluten' and not a redundant 'no' match (which we
    // don't have anyway). The point of this test is to pin the
    // longest-first merge behavior in case 'no' is ever added.
    const out = findAllergyKeywords('We have a no gluten request.');
    const kws = out.map((m) => m.keyword);
    expect(kws).toContain('no gluten');
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
