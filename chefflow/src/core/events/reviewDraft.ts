// ---------------------------------------------------------------------------
// Round-trip storage for the "create new recipe" detour inside the New-Event
// review step.
//
// The chef can click "Create new recipe" on an unmatched dish, get bounced
// over to the recipe editor, and then return here to finish reviewing the
// event. We persist just enough state in sessionStorage to reconstruct the
// review screen on the way back (the event itself + which dishes were linked
// to which recipe ids + which were marked "ready to go").
//
// sessionStorage (not localStorage) by design: a draft is only meaningful
// inside the current browser tab and should evaporate when the tab closes.
// ---------------------------------------------------------------------------

import type { KitchenEvent } from '../types';

const STORAGE_KEY = 'chefflow:event-review-draft';

export interface SerializedReviewDraft {
  event: KitchenEvent;
  /** dishId → recipeId for every dish that's currently linked to a recipe. */
  matchRecipeIds: Record<string, string>;
  /** Dish ids the chef has marked "ready to go". */
  readyDishIds: string[];
  /** The stub recipe id we navigated away to fill in. */
  awaitingRecipeId: string;
}

export function saveReviewDraft(draft: SerializedReviewDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full / disabled — ignore. Worst case the user lands back on
    // the empty events library and can re-run extraction.
  }
}

export function loadReviewDraft(): SerializedReviewDraft | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SerializedReviewDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.event || typeof parsed.event.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReviewDraft(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
