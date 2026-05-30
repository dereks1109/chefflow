// Module-level cache for the owner's groups list. Three editors
// (RecipeEditor, EventEditor, RecipesLibrary's new-menu modal) all
// need the groups to render their per-item share chip row, and the
// list rarely changes during a session — caching once avoids three
// redundant /api/teams/groups calls when the chef navigates between
// the editors. Invalidate explicitly when groups are created /
// renamed / deleted in Settings so the chips stay in sync.

import { listGroups, type TeamGroup } from './teamsClient';

let cached: Promise<TeamGroup[]> | null = null;

/** Fetch (or return cached) groups for the current user. Errors clear
 *  the cache so the next call retries — a transient 401 during a
 *  Clerk session refresh shouldn't poison the cache for the session. */
export function getGroupsCached(): Promise<TeamGroup[]> {
  if (cached) return cached;
  const p = listGroups().catch((err: unknown) => {
    if (cached === p) cached = null;
    throw err;
  });
  cached = p;
  return p;
}

/** Drop the cached list — call from Settings handlers after a group
 *  create / rename / delete so the next editor mount sees fresh data. */
export function invalidateGroupsCache(): void {
  cached = null;
}
