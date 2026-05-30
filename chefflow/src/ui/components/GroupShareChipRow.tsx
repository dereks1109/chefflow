import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useTierStore } from '../../state/useTierStore';
import { getGroupsCached } from '../../core/teams/groupsCache';
import type { TeamGroup } from '../../core/teams/teamsClient';

// Per-item "Share with" chip row used by RecipeEditor, EventEditor,
// and the new-menu modal in RecipesLibrary. Renders one pill per
// group the owner has; clicking a pill toggles that group_id in/out
// of the row's `selectedGroupIds`. When the value is undefined or
// empty AND a Default group exists, the Default chip is pre-selected
// so existing items keep their pre-T4 "shared with everyone" visibility
// — the user has to actively untick to make an item private.
//
// Hidden entirely when:
//   - The chef isn't on Enterprise tier (no team to share with).
//   - The chip is rendered inside a read-only editor surface (the
//     item is a shared row the caller can't modify).
//   - The groups fetch returns an empty list.

interface Props {
  /** Current value from the row's payload.sharedWithGroupIds field. */
  selectedGroupIds: string[] | undefined;
  /** Called with the FULL next array each time a chip toggles. */
  onChange: (next: string[]) => void;
  /** Hide the row entirely when the surrounding editor is view-only. */
  readOnly?: boolean;
}

export default function GroupShareChipRow({ selectedGroupIds, onChange, readOnly }: Props) {
  const tier = useTierStore((s) => s.tier);
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);

  useEffect(() => {
    if (tier !== 'enterprise') return;
    let cancelled = false;
    void getGroupsCached()
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch(() => { if (!cancelled) setGroups([]); });
    return () => { cancelled = true; };
  }, [tier]);

  if (tier !== 'enterprise') return null;
  if (readOnly) return null;
  if (!groups) return null;          // first paint before fetch resolves
  if (groups.length === 0) return null;

  // Implicit default-on: undefined / empty means the chef hasn't
  // explicitly chosen yet → treat as shared with Default. First
  // toggle persists an explicit array, after which only the array
  // controls visibility.
  const defaultId = groups.find((g) => g.isDefault)?.id;
  const effective =
    Array.isArray(selectedGroupIds) && selectedGroupIds.length > 0
      ? selectedGroupIds
      : defaultId
        ? [defaultId]
        : [];

  function toggle(groupId: string) {
    const next = effective.includes(groupId)
      ? effective.filter((id) => id !== groupId)
      : [...effective, groupId];
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-label="Share with groups"
      data-testid="group-share-chip-row"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Users className="h-3 w-3" aria-hidden="true" />
        Share with:
      </span>
      {groups.map((group) => {
        const checked = effective.includes(group.id);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => toggle(group.id)}
            aria-pressed={checked}
            data-testid={`group-share-chip-${group.id}`}
            className={[
              'inline-flex items-center px-3 h-7 rounded-full text-xs font-medium transition-colors',
              checked
                ? 'bg-accent text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-surface-2 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-surface-3',
            ].join(' ')}
          >
            {checked && <span className="mr-1" aria-hidden="true">✓</span>}
            {group.name}
          </button>
        );
      })}
    </div>
  );
}
