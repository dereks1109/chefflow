import { describe, it, expect, beforeEach } from 'vitest';
import { useUnitSystemStore } from './unitSystemStore';

beforeEach(() => {
  window.localStorage.clear();
  useUnitSystemStore.setState({ system: 'auto' });
});

describe('unitSystemStore', () => {
  it('defaults to auto', () => {
    expect(useUnitSystemStore.getState().system).toBe('auto');
  });
  it('setSystem updates the value', () => {
    useUnitSystemStore.getState().setSystem('metric');
    expect(useUnitSystemStore.getState().system).toBe('metric');
  });
  it('persists across store re-reads via localStorage', () => {
    useUnitSystemStore.getState().setSystem('imperial');
    const raw = window.localStorage.getItem('chefflow:unit-system');
    expect(raw).toContain('imperial');
  });
});
