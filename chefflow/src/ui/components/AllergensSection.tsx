import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { useProfileStore } from '../../state/useProfileStore';
import { ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from '../../core/recipes/llm/allergens';
import { getRecipeAllergenList } from '../../core/recipes/recipeShape';
import { addEntry as addAuditEntry, markSynced as markAuditSynced } from '../../db/allergenAuditsRepo';
import { pushAllergenAudit } from '../../core/audit/allergenAuditClient';
import { getRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import { applyRecipeAllergenRemove } from '../../core/recipes/llm/allergens';
import AllergenRemovalModal from './AllergenRemovalModal';
import type { AllergenTag, AllergenRemovalReason, Recipe } from '../../core/types';

// ---------------------------------------------------------------------------
// AllergensSection — chef-declared allergens (aggregated from ingredient
// flags) + free-form "other tags" for non-safety labels (cuisine, occasion,
// dietary preferences like "vegan", etc.).
//
// 2026-05-28 redesign: allergens are no longer added at the recipe level.
// The chef adds them on the specific ingredient row (where the 5-second
// cooldown modal lives and where the supplier label is closest at hand);
// this section displays the UNION as a read-only-add aggregation. The X
// on each recipe-level pill still opens AllergenRemovalModal (preserving
// the audit + reason + cooldown), and confirmation cascades — stripping
// the tag from every ingredient that carried it.
//
// "Other tags" is the new free-form chef-declared slot that lives where
// the closed UK-14 picker used to. Explicitly non-safety: cuisine,
// occasion, prep style. The UI copy + section label make it clear that
// allergens belong on ingredients, not here.
// ---------------------------------------------------------------------------

function ingredientsFlaggedWith(recipe: Recipe, tag: AllergenTag): string[] {
  return recipe.ingredients
    .filter((i) => i.allergenFlags?.includes(tag))
    .map((i) => i.name)
    .filter((n): n is string => Boolean(n));
}

interface Props {
  recipe: Recipe;
  onChange: (next: Recipe) => void;
  /** Notify parent after an allergen-removal audit entry persists so the
   *  per-recipe history view can refetch. */
  onAllergenAudit?: () => void;
}

export default function AllergensSection({ recipe, onChange, onAllergenAudit }: Props) {
  const profileDisplayName = useProfileStore((s) => s.displayName);
  const { user } = useUser();

  const [pendingRemovalTag, setPendingRemovalTag] = useState<AllergenTag | null>(null);
  const [newOtherTagDraft, setNewOtherTagDraft] = useState('');
  const [auditError, setAuditError] = useState<string | null>(null);

  // Reads through the shim so legacy rows (where allergens may still live
  // under `analysis.allergens`) continue to render until the next save
  // promotes them to top-level.
  const allergens = getRecipeAllergenList(recipe);
  const otherTags = recipe.otherTags ?? [];

  function requestRemoveAllergen(tag: AllergenTag) {
    setPendingRemovalTag(tag);
  }

  async function confirmRemoveAllergen(reasons: AllergenRemovalReason[], otherText?: string) {
    const tag = pendingRemovalTag;
    if (!tag) return;
    // Write the audit FIRST — Rule 12 (fail loud). If Dexie throws we abort
    // the patch so we never lose the safety signal without a recorded reason.
    const entry = {
      id: randomId(),
      recipeId: recipe.id,
      recipeTitleAtTime: recipe.title,
      removedTag: tag,
      reasons,
      otherText,
      ingredientsAtTime: ingredientsFlaggedWith(recipe, tag),
      removedAt: Date.now(),
      userClerkId: user?.id,
      userDisplayName: profileDisplayName?.trim() || user?.fullName || undefined,
    };
    try {
      await addAuditEntry(entry);
    } catch {
      setAuditError('Could not record audit entry — allergen tag was NOT removed.');
      setPendingRemovalTag(null);
      return;
    }
    // Cascade: removes the tag from recipe.allergens AND every ingredient
    // that carries it (see applyRecipeAllergenRemove). The chef's audit
    // entry above documents the rationale + 5-second cooldown gate covers
    // the entire operation.
    onChange(applyRecipeAllergenRemove(recipe, tag));
    setPendingRemovalTag(null);
    onAllergenAudit?.();
    void pushAllergenAudit(entry).then((ok) => {
      if (ok) void markAuditSynced(entry.id);
    });
  }

  function addOtherTag() {
    const raw = newOtherTagDraft.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (otherTags.includes(lower)) {
      setNewOtherTagDraft('');
      return;
    }
    onChange({ ...recipe, otherTags: [...otherTags, lower] });
    setNewOtherTagDraft('');
  }

  function removeOtherTag(tag: string) {
    onChange({ ...recipe, otherTags: otherTags.filter((t) => t !== tag) });
  }

  return (
    <>
    <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <legend className="text-sm font-medium px-1">Allergens (chef-declared) and other tags</legend>
      <p className="mt-1 text-xs text-slate-500">
        Allergens come from the ingredient rows below. To tag an allergen,
        flag it on the specific ingredient — the union shows here. Use
        <strong> Add other tags </strong>for non-safety labels (cuisine,
        occasion, dietary preferences). ChefFlow never detects allergens.
      </p>

      {auditError && (
        <div role="alert" className="mt-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-900 dark:text-red-200">
          {auditError}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Recipe allergens and tags">
        {allergens.length === 0 && otherTags.length === 0 && (
          <span className="text-xs text-slate-500 italic">
            No allergens flagged yet. Flag them on ingredient rows; add other tags below.
          </span>
        )}
        {allergens.map((a) => (
          <span
            key={`a-${a}`}
            data-testid={`allergens-pill-${a}`}
            className="inline-flex items-center gap-1 rounded-full border border-red-600
                       text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
            title={`${ALLERGEN_LABEL[a]} — ${ALLERGEN_EXAMPLES[a]}`}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {ALLERGEN_LABEL[a]}
            <button
              type="button"
              onClick={() => requestRemoveAllergen(a)}
              aria-label={`Remove allergen ${ALLERGEN_LABEL[a]}`}
              className="ml-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {otherTags.map((t) => (
          <span
            key={`o-${t}`}
            data-testid={`other-tag-pill-${t}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-600
                       text-slate-700 dark:text-slate-200 px-2 py-0.5 text-xs"
          >
            {t}
            <button
              type="button"
              onClick={() => removeOtherTag(t)}
              aria-label={`Remove tag ${t}`}
              className="ml-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <SubRecipeInheritedChips recipe={recipe} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={newOtherTagDraft}
          onChange={(e) => setNewOtherTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOtherTag();
            }
          }}
          placeholder="e.g. italian, vegan-friendly, weeknight…"
          className="input flex-1 text-sm"
          aria-label="Add other tag"
          data-testid="other-tag-input"
        />
        <button
          type="button"
          onClick={addOtherTag}
          disabled={newOtherTagDraft.trim().length === 0}
          data-testid="other-tag-add"
          className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add other tags
        </button>
      </div>
    </fieldset>
    <AllergenRemovalModal
      open={pendingRemovalTag !== null}
      allergenLabel={pendingRemovalTag ? ALLERGEN_LABEL[pendingRemovalTag] : ''}
      ingredientsAtTime={pendingRemovalTag ? ingredientsFlaggedWith(recipe, pendingRemovalTag) : []}
      onCancel={() => setPendingRemovalTag(null)}
      onConfirm={(reasons, otherText) => void confirmRemoveAllergen(reasons, otherText)}
    />
    </>
  );
}

// ---------------------------------------------------------------------------
// SubRecipeInheritedChips — read-only allergen chips lifted from each
// `@`-linked sub-recipe. Visually identical to the editable allergen pills
// above but no remove X (chef edits the SOURCE sub-recipe to change them).
// ---------------------------------------------------------------------------
interface InheritedChip {
  id: string;
  value: AllergenTag;
  source: string;
}

function SubRecipeInheritedChips({ recipe }: { recipe: Recipe }) {
  const [chips, setChips] = useState<InheritedChip[]>([]);

  useEffect(() => {
    let cancelled = false;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const ing of recipe.ingredients) {
      if (!ing.componentRecipeId) continue;
      if (seen.has(ing.componentRecipeId)) continue;
      seen.add(ing.componentRecipeId);
      ids.push(ing.componentRecipeId);
    }
    if (ids.length === 0) {
      setChips([]);
      return;
    }
    void Promise.all(ids.map((id) => getRecipe(id))).then((subs) => {
      if (cancelled) return;
      const next: InheritedChip[] = [];
      for (const sub of subs) {
        if (!sub) continue;
        const title = sub.title || 'Untitled sub-recipe';
        for (const a of getRecipeAllergenList(sub)) {
          next.push({ id: `${sub.id}-a-${a}`, value: a, source: title });
        }
      }
      setChips(next);
    });
    return () => { cancelled = true; };
  }, [recipe.ingredients]);

  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-full border border-red-600
                     text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
          title={`Inherited from ${c.source}`}
          data-testid={`allergens-inherited-${c.value}`}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {ALLERGEN_LABEL[c.value]}
        </span>
      ))}
    </>
  );
}
