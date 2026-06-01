import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { History } from 'lucide-react';
import { listByRecipe, listUnsyncedForRecipe, markSynced } from '../../db/allergenAuditsRepo';
import { pushAllergenAudit } from '../../core/audit/allergenAuditClient';
import { ALLERGEN_LABEL } from '../../core/recipes/llm/allergens';
import type { AllergenAuditEntry, AllergenRemovalReason } from '../../core/types';

const REASON_LABEL: Record<AllergenRemovalReason, string> = {
  'ingredient-changed': 'Ingredient changed to a non-allergenic version',
  'recipe-changed': 'Recipe changed',
  'mistakenly-added': 'Tag was accidentally or mistakenly added',
  other: 'Other',
};

interface Props {
  recipeId: string;
  /** Bumps to force a refetch — pass the count of recent removals from
   *  the parent so the list refreshes after a new audit entry is written. */
  refreshKey?: number;
}

/**
 * Per-recipe allergen-removal history. Liability backbone — every removed
 * tag is recorded here with the reason(s) the chef picked and a snapshot of
 * the ingredients at the time, so an auditor (the user themselves, or a
 * future regulator) can trace why a safety signal was stripped.
 */
export default function AllergenHistorySection({ recipeId, refreshKey = 0 }: Props) {
  const [entries, setEntries] = useState<AllergenAuditEntry[] | null>(null);
  const { user } = useUser();
  const currentUserId = user?.id;

  useEffect(() => {
    let cancelled = false;
    void listByRecipe(recipeId).then((list) => {
      if (cancelled) return;
      // The local Dexie store is browser-scoped, not user-scoped. Multiple
      // Clerk users on the same browser would otherwise see each other's
      // audits — a privacy + correctness bug. Filter to entries created by
      // whoever is signed in right now (or, when signed-out, only show
      // anonymous entries). Cross-user visibility lives on /admin where
      // it belongs.
      const filtered = list.filter((e) =>
        currentUserId
          ? e.userClerkId === currentUserId
          : !e.userClerkId,
      );
      setEntries(filtered);
    });
    return () => {
      cancelled = true;
    };
  }, [recipeId, refreshKey, currentUserId]);

  // Best-effort backfill: any local entries that weren't synced (network
  // flake, signed out at the time, etc.) get re-pushed when the editor
  // opens. Fire-and-forget — failures stay pending for the next attempt.
  useEffect(() => {
    let cancelled = false;
    void listUnsyncedForRecipe(recipeId).then(async (pending) => {
      if (cancelled || pending.length === 0) return;
      for (const entry of pending) {
        const ok = await pushAllergenAudit(entry);
        if (ok) void markSynced(entry.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  if (!entries || entries.length === 0) return null;

  // T12 — fieldset+border+bg chrome removed; section sits inline in
  // the recipe-editor form alongside the other rows.
  return (
    <div data-testid="allergen-history-section">
      <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        Allergen history ({entries.length})
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Record of allergen tags removed from this recipe. Local to this device.
      </p>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li
            key={e.id}
            className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-rose-700 dark:text-rose-300">
                {ALLERGEN_LABEL[e.removedTag]}
              </span>
              <time className="text-[11px] text-slate-500" dateTime={new Date(e.removedAt).toISOString()}>
                {new Date(e.removedAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Removed by {e.userDisplayName ?? '(anonymous)'}
            </p>
            <p className="mt-1 text-slate-700 dark:text-slate-300">
              {e.reasons.map((r) => REASON_LABEL[r]).join('; ')}
              {e.otherText ? ` — ${e.otherText}` : ''}
            </p>
            {e.ingredientsAtTime.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
                Ingredients at the time: {e.ingredientsAtTime.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
