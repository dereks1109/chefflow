import { describe, it, expect, beforeEach } from 'vitest';
import { useTourState, TOTAL_STEPS } from './useTourState';

beforeEach(() => {
  window.localStorage.clear();
  useTourState.setState({ active: false, step: 0 });
});

describe('useTourState', () => {
  it('start() activates the tour at step 0 when no dismiss flag is set', () => {
    useTourState.getState().start();
    expect(useTourState.getState().active).toBe(true);
    expect(useTourState.getState().step).toBe(0);
  });

  it('start() is a no-op when the dismiss flag is already in localStorage', () => {
    window.localStorage.setItem('chefflow:tour-dismissed-v1', '1');
    useTourState.getState().start();
    expect(useTourState.getState().active).toBe(false);
  });

  it('next() advances the step pointer one at a time', () => {
    useTourState.getState().start();
    useTourState.getState().next();
    expect(useTourState.getState().step).toBe(1);
    useTourState.getState().next();
    expect(useTourState.getState().step).toBe(2);
  });

  it('next() at the final step closes the tour AND writes the dismiss flag', () => {
    useTourState.getState().start();
    useTourState.setState({ step: TOTAL_STEPS }); // final "Got it" card
    useTourState.getState().next();
    expect(useTourState.getState().active).toBe(false);
    expect(window.localStorage.getItem('chefflow:tour-dismissed-v1')).toBe('1');
  });

  it('dismissForever() closes the tour AND writes the dismiss flag', () => {
    useTourState.getState().start();
    expect(useTourState.getState().active).toBe(true);
    useTourState.getState().dismissForever();
    expect(useTourState.getState().active).toBe(false);
    expect(window.localStorage.getItem('chefflow:tour-dismissed-v1')).toBe('1');
  });
});
