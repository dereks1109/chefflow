import { describe, it, expect } from 'vitest';
import { parseMenuAnalysis, MenuCheckError } from './menuCheck';

describe('parseMenuAnalysis', () => {
  it('parses a complete response with categorised suggestions', () => {
    const raw = JSON.stringify({
      verdict: 'warnings',
      issues: [
        { severity: 'blocker', message: 'Vegan guest has no safe dish.' },
        { severity: 'warning', message: 'Limited gluten-free options.' },
      ],
      suggestions: [
        { category: 'allergy', text: 'Add a roasted-vegetable plate.' },
        { category: 'allergy', text: 'Mark nut-free items clearly.' },
        { category: 'budget', text: 'Swap rib eye for sirloin to cut £15.' },
        { category: 'budget', text: 'Skip the optional brandy in the sauce.' },
        { category: 'other', text: 'Pre-portion plates in the kitchen.' },
      ],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.verdict).toBe('warnings');
    expect(got.issues).toHaveLength(2);
    expect(got.issues[0].severity).toBe('blocker');
    expect(got.suggestions).toHaveLength(5);
    expect(got.suggestions[0]).toEqual({ category: 'allergy', text: 'Add a roasted-vegetable plate.' });
    expect(got.suggestions[2].category).toBe('budget');
    expect(typeof got.analyzedAt).toBe('number');
  });

  it('always returns exactly 5 suggestions, padding with neutral entries when the LLM returns fewer', () => {
    const raw = JSON.stringify({
      verdict: 'ok',
      issues: [],
      suggestions: [
        { category: 'allergy', text: 'Label the peanut-free options.' },
      ],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.suggestions).toHaveLength(5);
    expect(got.suggestions[0]).toEqual({ category: 'allergy', text: 'Label the peanut-free options.' });
    expect(got.suggestions.slice(1).every((s) => s.category === 'other')).toBe(true);
  });

  it('falls back to category=other when the LLM returns a legacy string[] shape', () => {
    const raw = JSON.stringify({
      verdict: 'ok',
      issues: [],
      suggestions: ['Old style 1', 'Old style 2'],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.suggestions).toHaveLength(5);
    expect(got.suggestions[0]).toEqual({ category: 'other', text: 'Old style 1' });
    expect(got.suggestions[1]).toEqual({ category: 'other', text: 'Old style 2' });
  });

  it('coerces unknown categories to "other" and drops items with empty text', () => {
    const raw = JSON.stringify({
      verdict: 'ok',
      issues: [],
      suggestions: [
        { category: 'wat', text: 'A' },
        { category: 'budget', text: '   ' },
        { category: 'allergy', text: 'B' },
        { category: 'other', text: 'C' },
        { category: 'allergy', text: 'D' },
        { category: 'budget', text: 'E' },
      ],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.suggestions).toHaveLength(5);
    expect(got.suggestions[0]).toEqual({ category: 'other', text: 'A' });
    expect(got.suggestions[1]).toEqual({ category: 'allergy', text: 'B' });
  });

  it('strips markdown fences', () => {
    const raw = '```json\n{"verdict":"ok","issues":[],"suggestions":[]}\n```';
    const got = parseMenuAnalysis(raw);
    expect(got.verdict).toBe('ok');
  });

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Sure, here is the verdict: {"verdict":"blocked","issues":[],"suggestions":[]}';
    const got = parseMenuAnalysis(raw);
    expect(got.verdict).toBe('blocked');
  });

  it('defaults unknown verdict to "warnings"', () => {
    const raw = JSON.stringify({ verdict: 'maybe', issues: [], suggestions: [] });
    expect(parseMenuAnalysis(raw).verdict).toBe('warnings');
  });

  it('drops malformed issues and empty messages', () => {
    const raw = JSON.stringify({
      verdict: 'warnings',
      issues: [
        { severity: 'blocker', message: '   ' },
        { severity: 'bogus', message: 'falls back to warning' },
        'not-an-object',
        { severity: 'warning' },
      ],
      suggestions: [],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.issues).toEqual([
      { severity: 'warning', message: 'falls back to warning' },
    ]);
  });

  it('caps suggestions at 5', () => {
    const raw = JSON.stringify({
      verdict: 'warnings',
      issues: [],
      suggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.suggestions).toHaveLength(5);
    expect(got.suggestions.map((s) => s.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseMenuAnalysis('not json at all')).toThrow(MenuCheckError);
  });
});
