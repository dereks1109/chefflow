import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { useProfileStore } from '../../state/useProfileStore';
import {
  ALLERGEN_LABEL,
  ALLERGEN_EXAMPLES,
  ALLERGEN_TAGS,
} from '../../core/recipes/llm/allergens';
import { getRecipeAllergenList } from '../../core/recipes/recipeShape';
import { addEntry as addAuditEntry, markSynced as markAuditSynced } from '../../db/allergenAuditsRepo';
import { pushAllergenAudit } from '../../core/audit/allergenAuditClient';
import { getRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import AllergenRemovalModal from './AllergenRemovalModal';
import AllergenAdditionModal from './AllergenAdditionModal';
import type { AllergenTag, AllergenRemovalReason, Recipe } from '../../core/types';

// ---------------------------------------------------------------------------
// AllergensSection — chef-declared allergen pills only. No AI, no
// text-classifier, no inference. The chef picks from a closed UK-14 list
// via the "Add allergen" picker; removal goes through the 5-second
// cooldown + reason-capture modal.
//
// Replaces the bundled tags+allergens UX previously in AnalysisSection
// (2026-05-28 split). The free-text chip input + "type 'milk' → matches
// Milk allergen" classifier was removed for the same reason we never let
// the LLM tag allergens: the input pattern reads as AI-inference, which
// blurs the "chef-declared, ChefFlow doesn't detect" framing.
// ---------------------------------------------------------------------------

// Inline replacement for the deleted `findIngredientsForAllergen` helper.
// Returns names of ingredients the chef manually flagged with a given tag —
// used by the audit log + removal modal to record context.
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingRemovalTag, setPendingRemovalTag] = useState<AllergenTag | null>(null);
  const [pendingAddAllergen, setPendingAddAllergen] = useState<AllergenTag | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Reads through the shim so legacy rows (where allergens may still live
  // under `analysis.allergens`) continue to render until the next save
  // promotes them to top-level.
  const allergens = getRecipeAllergenList(recipe);
  const availableToAdd = ALLERGEN_TAGS.filter((t) => !allergens.includes(t));

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
    onChange({ ...recipe, allergens: allergens.filter((a) => a !== tag) });
    setPendingRemovalTag(null);
    onAllergenAudit?.();
    void pushAllergenAudit(entry).then((ok) => {
      if (ok) void markAuditSynced(entry.id);
    });
  }

  function commitAddAllergen() {
    if (!pendingAddAllergen) return;
    if (!allergens.includes(pendingAddAllergen)) {
      onChange({ ...recipe, allergens: [...allergens, pendingAddAllergen] });
    }
    setPendingAddAllergen(null);
    setPickerOpen(false);
  }

  return (
    <>
    <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <legend className="text-sm font-medium px-1">Allergens (chef-declared)</legend>
      <p className="mt-1 text-xs text-slate-500">
        ChefFlow does not detect allergens. Anything below is what you have
        explicitly tagged — supplier labels remain authoritative.
      </p>

      {auditError && (
        <div role="alert" className="mt-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-900 dark:text-red-200">
          {auditError}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Recipe allergens">
        {allergens.length === 0 && (
          <span className="text-xs text-slate-500 italic">None tagged.</span>
        )}
        {allergens.map((a) => (
          <span
            key={a}
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
        <SubRecipeInheritedChips recipe={recipe} />
      </div>

      {availableToAdd.length > 0 && (
        <div className="mt-3">
          {!pickerOpen ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              data-testid="allergen-picker-open"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add allergen
            </button>
          ) : (
            <div
              role="region"
              aria-label="Add allergen picker"
              data-testid="allergen-picker"
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-2 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Pick from the 14 UK declared allergens
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close allergen picker"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {availableToAdd.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => setPendingAddAllergen(t)}
                      data-testid={`allergen-picker-option-${t}`}
                      title={ALLERGEN_EXAMPLES[t]}
                      className="w-full text-left px-2 py-1.5 rounded-md text-xs bg-white dark:bg-surface-1 border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700"
                    >
                      {ALLERGEN_LABEL[t]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </fieldset>
    <AllergenRemovalModal
      open={pendingRemovalTag !== null}
      allergenLabel={pendingRemovalTag ? ALLERGEN_LABEL[pendingRemovalTag] : ''}
      ingredientsAtTime={pendingRemovalTag ? ingredientsFlaggedWith(recipe, pendingRemovalTag) : []}
      onCancel={() => setPendingRemovalTag(null)}
      onConfirm={(reasons, otherText) => void confirmRemoveAllergen(reasons, otherText)}
    />
    <AllergenAdditionModal
      open={pendingAddAllergen !== null}
      allergenLabel={pendingAddAllergen ? ALLERGEN_LABEL[pendingAddAllergen] : ''}
      onCancel={() => setPendingAddAllergen(null)}
      onConfirm={commitAddAllergen}
    />
    </>
  );
}

// ---------------------------------------------------------------------------
// SubRecipeInheritedChips — read-only allergen chips lifted from each
// `@`-linked sub-recipe. Visually identical to the editable allergen pills
// above but no remove X (chef edits the SOURCE sub-recipe to change them).
// `title` attribute names the source so hover/long-press surfaces it.
//
// We don't dedup against the parent's own tags — both can coexist (e.g.
// "Milk" appearing twice because both this recipe and the sauce contribute).
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
