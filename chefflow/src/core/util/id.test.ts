import { describe, it, expect } from 'vitest';
import { randomId } from './id';

describe('randomId', () => {
  it('returns a string of length 10 starting with r_', () => {
    const id = randomId();
    expect(id).toMatch(/^r_[a-z0-9]{8}$/);
  });
  it('produces different ids on consecutive calls', () => {
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe(b);
  });
});
