import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEvent, useRecipes } from './useEvent';
import { db } from '../dexie';
import { saveEvent, deleteEvent } from '../eventsRepo';
import { saveRecipe } from '../recipesRepo';
import type { KitchenEvent, Recipe } from '../../core/types';

// ---------------------------------------------------------------------------
// These tests verify the live-query contract: the hook should reflect Dexie
// state on mount and re-render when the underlying table changes. We use the
// repo write functions (saveEvent / saveRecipe) so we exercise the same
// triggers production code uses.
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<KitchenEvent> = {}): KitchenEvent {
  return {
    id: 'e_hook_test',
    title: 'Hook Test Event',
    serveAt: '2026-06-15T18:00:00.000Z',
    notes: '',
    dishes: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_hook_test',
    title: 'Hook Test Recipe',
    originalYield: 2,
    ingredients: [],
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.events.clear();
  await db.recipes.clear();
});

describe('useEvent', () => {
  it('starts in loading state and transitions to ready when the event exists', async () => {
    await saveEvent(makeEvent());

    const { result } = renderHook(() => useEvent('e_hook_test'));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status === 'ready') {
      expect(result.current.event.title).toBe('Hook Test Event');
    }
  });

  it('transitions to not-found when the event id does not exist', async () => {
    const { result } = renderHook(() => useEvent('does-not-exist'));

    await waitFor(() => expect(result.current.status).toBe('not-found'));
    expect(result.current.event).toBeNull();
  });

  it('stays in loading when id is undefined (e.g. unresolved route param)', async () => {
    const { result } = renderHook(() => useEvent(undefined));
    // Give live-query a tick to misbehave if it were going to.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.status).toBe('loading');
  });

  it('re-renders when the underlying event is updated via saveEvent', async () => {
    await saveEvent(makeEvent({ title: 'V1' }));
    const { result } = renderHook(() => useEvent('e_hook_test'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      if (result.current.status === 'ready') {
        expect(result.current.event.title).toBe('V1');
      }
    });

    await act(async () => {
      await saveEvent(makeEvent({ title: 'V2', updatedAt: 2000 }));
    });

    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('expected ready');
      expect(result.current.event.title).toBe('V2');
    });
  });

  it('transitions ready → not-found when the event is deleted', async () => {
    await saveEvent(makeEvent());
    const { result } = renderHook(() => useEvent('e_hook_test'));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await deleteEvent('e_hook_test');
    });

    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });
});

describe('useRecipes', () => {
  it('starts loading and resolves to the full recipe list', async () => {
    await saveRecipe(makeRecipe({ id: 'r1', title: 'A' }));
    await saveRecipe(makeRecipe({ id: 'r2', title: 'B' }));

    const { result } = renderHook(() => useRecipes());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toHaveLength(2);
  });

  it('re-renders when a recipe is added', async () => {
    const { result } = renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toHaveLength(0);

    await act(async () => {
      await saveRecipe(makeRecipe({ id: 'r_new', title: 'New' }));
    });

    await waitFor(() => expect(result.current.recipes).toHaveLength(1));
    expect(result.current.recipes[0].title).toBe('New');
  });
});
