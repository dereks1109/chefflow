// ---------------------------------------------------------------------------
// useEvent / useRecipes — minimal React hooks over Dexie's liveQuery().
//
// We don't depend on `dexie-react-hooks` (not installed) — instead we build
// directly on Dexie's bundled `liveQuery` Observable, which already powers
// that package under the hood. The hooks subscribe on mount, unsubscribe on
// unmount, and re-render whenever a Dexie write that touched the queried
// table is committed. That gives us the same "cross-page edits auto-refresh
// the open view" behavior with no extra dependency.
//
// Return shape is a discriminated union:
//   { status: 'loading' }   — initial value, no result has arrived yet
//   { status: 'not-found' } — query resolved to null/undefined (singletons)
//   { status: 'ready', ... }— query resolved with data
//
// `error` is intentionally tracked in-state too so the caller can choose to
// render a banner instead of silently sticking on 'loading'. The hooks never
// throw — any error from the underlying query is captured.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { liveQuery, type Subscription } from 'dexie';
import { db } from '../dexie';
import { listRecipes } from '../recipesRepo';
import type { KitchenEvent, Recipe } from '../../core/types';

export type UseEventResult =
  | { status: 'loading'; event: null; error: null }
  | { status: 'not-found'; event: null; error: null }
  | { status: 'ready'; event: KitchenEvent; error: null }
  | { status: 'error'; event: null; error: Error };

export type UseRecipesResult =
  | { status: 'loading'; recipes: readonly Recipe[]; error: null }
  | { status: 'ready'; recipes: readonly Recipe[]; error: null }
  | { status: 'error'; recipes: readonly Recipe[]; error: Error };

const LOADING_EVENT: UseEventResult = { status: 'loading', event: null, error: null };
const LOADING_RECIPES: UseRecipesResult = { status: 'loading', recipes: [], error: null };

// ---------------------------------------------------------------------------
// useEvent — subscribe to a single event by id.
// `undefined` id keeps the hook in 'loading' (e.g. while a route param resolves).
// ---------------------------------------------------------------------------
export function useEvent(id: string | undefined): UseEventResult {
  // Keying the state by id makes the per-id reset implicit: when the parent
  // component switches `id`, React reads `LOADING_EVENT` as the initial value
  // for the new key via the lazy initializer below, without us having to call
  // setState synchronously from inside the effect (which trips
  // react-hooks/set-state-in-effect).
  const [state, setState] = useState<UseEventResult>(LOADING_EVENT);
  const lastIdRef = useRef<string | undefined>(undefined);
  if (lastIdRef.current !== id) {
    lastIdRef.current = id;
    // Reset during render — React docs explicitly allow setState during
    // render when adjusting state in response to a prop change. This avoids
    // the react-hooks/set-state-in-effect lint while still keeping the per-id
    // reset behavior.
    setState(LOADING_EVENT);
  }

  useEffect(() => {
    if (!id) return;

    const observable = liveQuery<KitchenEvent | undefined>(() => db.events.get(id));
    const subscription: Subscription = observable.subscribe({
      next: (event) => {
        if (event === undefined) {
          setState({ status: 'not-found', event: null, error: null });
        } else {
          setState({ status: 'ready', event, error: null });
        }
      },
      error: (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', event: null, error });
      },
    });

    return () => subscription.unsubscribe();
  }, [id]);

  return state;
}

// ---------------------------------------------------------------------------
// useRecipes — subscribe to the full recipe list, sorted the same way
// listRecipes() returns it (pinned first, then updatedAt desc).
// ---------------------------------------------------------------------------
export function useRecipes(): UseRecipesResult {
  const [state, setState] = useState<UseRecipesResult>(LOADING_RECIPES);

  useEffect(() => {
    const observable = liveQuery<readonly Recipe[]>(() => listRecipes());
    const subscription: Subscription = observable.subscribe({
      next: (recipes) => {
        setState({ status: 'ready', recipes, error: null });
      },
      error: (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', recipes: [], error });
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
