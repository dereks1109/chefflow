import type { Dish } from '../types';

/**
 * Produces a deterministic short signature of an event's dishes. Two arrays
 * with the same dishes in the same order yield the same string; any change
 * (add / remove / edit / reorder) produces a different one. Used by the
 * workflow page to detect when a saved snapshot has gone stale relative to
 * the underlying dishes.
 *
 * Deliberately not a cryptographic hash — collisions don't matter here, and
 * a string-concat is faster + simpler to debug in the wild. We only care
 * about "did anything meaningful change".
 */
export function hashDishes(dishes: readonly Dish[]): string {
  return dishes
    .map((d) =>
      [
        d.id,
        d.name,
        d.recipeId ?? '',
        String(d.portions),
        d.startAt,
        d.notes ?? '',
        d.isPrepared ? '1' : '0',
      ].join(''),
    )
    .join('');
}
