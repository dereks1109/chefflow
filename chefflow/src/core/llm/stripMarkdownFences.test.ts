import { describe, it, expect } from 'vitest';
import { stripMarkdownFences } from './stripMarkdownFences';

describe('stripMarkdownFences', () => {
  it('passes bare JSON through untouched', () => {
    expect(stripMarkdownFences('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fence', () => {
    expect(stripMarkdownFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare ``` fence (no language tag)', () => {
    expect(stripMarkdownFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('extracts the outermost {...} from prose preamble', () => {
    expect(
      stripMarkdownFences('Sure, here is the JSON:\n{"a":1}\nHope that helps.'),
    ).toBe('{"a":1}');
  });

  it('extracts JSON when surrounded by prose without fences', () => {
    const out = stripMarkdownFences('Here you go: {"a":1, "b":[2,3]} OK?');
    expect(out).toBe('{"a":1, "b":[2,3]}');
  });

  it('trims surrounding whitespace', () => {
    expect(stripMarkdownFences('   {"a":1}   ')).toBe('{"a":1}');
  });
});
