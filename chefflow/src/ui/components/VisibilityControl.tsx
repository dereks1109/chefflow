import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, Users } from 'lucide-react';
import { useTierStore } from '../../state/useTierStore';
import { getGroupsCached } from '../../core/teams/groupsCache';
import type { TeamGroup } from '../../core/teams/teamsClient';

// T5 Phase B: one unified "Visible to" multi-check at the top of each
// editor. Replaces T4's GroupShareChipRow + the Recipe editor's
// separate Share-publicly / Unpublish buttons.
//
// Options:
//   - Community (recipes only; pass `community` prop)
//   - One pill per team the owner has created
//
// Nothing ticked = private (no community, no team).
//
// Self-hides when there's nothing meaningful to render:
//   - Non-Enterprise + no community pill → nothing.
//   - Non-Enterprise + community pill → just the Community pill.
//   - readOnly → nothing (the surrounding editor is view-only).

interface Props {
  /** Recipe / Event / Menu row's sharedWithGroupIds. */
  selectedGroupIds: string[] | undefined;
  /** Community toggle. Omit on Event + Menu callers where the
   *  entity isn't publishable to the community library. */
  community?: { checked: boolean; onChange: (next: boolean) => void };
  /** Called with the FULL next array each time a team chip toggles. */
  onGroupsChange: (next: string[]) => void;
  /** Hide the row entirely when the editor is showing a borrowed
   *  read-only row (chef can't change someone else's sharing). */
  readOnly?: boolean;
}

export default function VisibilityControl({
  selectedGroupIds,
  community,
  onGroupsChange,
  readOnly,
}: Props) {
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

  if (readOnly) return null;

  const showCommunity = community !== undefined;
  const isEnterprise = tier === 'enterprise';
  // T8 — Enterprise always sees the row, even with zero groups: an
  // inline "Create a team" link surfaces the next action instead of
  // self-hiding the control. We still suppress the row while the
  // cache is loading (groups === null) so we don't flash an empty
  // pill row before the request resolves.
  const showTeams = isEnterprise && groups !== null;

  // Nothing to render: non-Enterprise on an entity without a community
  // pill (Event / Menu callers) means there's no choice to make.
  if (!showCommunity && !showTeams) return null;

  const effectiveSelection = Array.isArray(selectedGroupIds) ? selectedGroupIds : [];

  function toggleGroup(groupId: string) {
    const next = effectiveSelection.includes(groupId)
      ? effectiveSelection.filter((id) => id !== groupId)
      : [...effectiveSelection, groupId];
    onGroupsChange(next);
  }

  return (
    <div
      role="group"
      aria-label="Visible to"
      data-testid="visibility-control"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        Visible to:
      </span>

      {showCommunity && community && (
        <button
          type="button"
          onClick={() => community.onChange(!community.checked)}
          aria-pressed={community.checked}
          data-testid="visibility-community"
          className={[
            'inline-flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition-colors',
            community.checked
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-700 dark:bg-surface-2 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-surface-3',
          ].join(' ')}
        >
          <Globe2 className="h-3 w-3" aria-hidden="true" />
          {community.checked && <span aria-hidden="true">✓</span>}
          Community
        </button>
      )}

      {showTeams && groups && groups.length === 0 && (
        <Link
          to="/teams"
          data-testid="visibility-no-teams"
          className="inline-flex items-center gap-1 px-3 h-7 rounded-full text-xs text-slate-500 underline hover:text-accent"
        >
          Create a team to share with
        </Link>
      )}

      {showTeams && groups && groups.map((group) => {
        const checked = effectiveSelection.includes(group.id);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => toggleGroup(group.id)}
            aria-pressed={checked}
            data-testid={`visibility-team-${group.id}`}
            className={[
              'inline-flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition-colors',
              checked
                ? 'bg-accent text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-surface-2 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-surface-3',
            ].join(' ')}
          >
            <Users className="h-3 w-3" aria-hidden="true" />
            {checked && <span aria-hidden="true">✓</span>}
            {group.name}
          </button>
        );
      })}
    </div>
  );
}
