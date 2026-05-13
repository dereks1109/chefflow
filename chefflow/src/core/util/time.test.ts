import { describe, it, expect } from 'vitest';
import { parseTime, formatTime, toMinutes } from './time';

describe('parseTime', () => {
  it('returns 0/0 for undefined', () => {
    expect(parseTime(undefined)).toEqual({ hours: 0, minutes: 0 });
  });
  it('returns 0/0 for empty string', () => {
    expect(parseTime('')).toEqual({ hours: 0, minutes: 0 });
  });
  it('parses minutes-only "30m"', () => {
    expect(parseTime('30m')).toEqual({ hours: 0, minutes: 30 });
  });
  it('parses hours-only "2h"', () => {
    expect(parseTime('2h')).toEqual({ hours: 2, minutes: 0 });
  });
  it('parses combined "1h 30m"', () => {
    expect(parseTime('1h 30m')).toEqual({ hours: 1, minutes: 30 });
  });
});

describe('formatTime', () => {
  it('returns undefined for 0/0', () => {
    expect(formatTime(0, 0)).toBeUndefined();
  });
  it('formats hours only', () => {
    expect(formatTime(2, 0)).toBe('2h');
  });
  it('formats minutes only', () => {
    expect(formatTime(0, 30)).toBe('30m');
  });
  it('formats combined', () => {
    expect(formatTime(1, 30)).toBe('1h 30m');
  });
});

describe('toMinutes (for event scaling)', () => {
  it('handles undefined → 0', () => {
    expect(toMinutes(undefined)).toBe(0);
  });
  it('handles "30m" → 30', () => {
    expect(toMinutes('30m')).toBe(30);
  });
  it('handles "1h 30m" → 90', () => {
    expect(toMinutes('1h 30m')).toBe(90);
  });
  it('handles "2h" → 120', () => {
    expect(toMinutes('2h')).toBe(120);
  });
});

describe('round-trip parse → format', () => {
  it.each(['30m', '2h', '1h 30m', '12h 55m'])('preserves %s', (s) => {
    const { hours, minutes } = parseTime(s);
    expect(formatTime(hours, minutes)).toBe(s);
  });
});
