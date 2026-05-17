import { describe, it, expect } from 'vitest';
import { parseMenuAnalysis, MenuCheckError } from './menuCheck';

describe('parseMenuAnalysis', () => {
  it('parses a complete response', () => {
    const raw = JSON.stringify({
      verdict: 'warnings',
      issues: [
        { severity: 'blocker', message: 'Vegan guest has no safe dish.' },
        { severity: 'warning', message: 'Limited gluten-free options.' },
      ],
      suggestions: ['Add a roasted-vegetable plate.', 'Swap pasta for rice noodles.'],
    });
    const got = parseMenuAnalysis(raw);
    expect(got.verdict).toBe('warnings');
    expect(got.issues).toHaveLength(2);
    expect(got.issues[0].severity).toBe('blocker');
    expect(got.suggestions).toEqual(['Add a roasted-vegetable plate.', 'Swap pasta for rice noodles.']);
    expect(typeof got.analyzedAt).toBe('number');
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
    expect(parseMenuAnalysis(raw).suggestions).toHaveLength(5);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseMenuAnalysis('not json at all')).toThrow(MenuCheckError);
  });
});
