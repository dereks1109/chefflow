import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { AlertTriangle, Plus, Sparkles, X } from 'lucide-react';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { useProfileStore } from '../../state/useProfileStore';
import { ALLERGEN_TAGS, ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from '../../core/recipes/llm/allergens';
import { analyzeRecipe } from '../../core/recipes/llm/recipeGen';
import { addEntry as addAuditEntry, markSynced as markAuditSynced } from '../../db/allergenAuditsRepo';
import { pushAllergenAudit } from '../../core/audit/allergenAuditClient';
import { getRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import AllergenRemovalModal from './AllergenRemovalModal';
import type { AllergenTag, AllergenRemovalReason, Recipe, RecipeAnalysis } from '../../core/types';

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
  onChange: (analysis: RecipeAnalysis) => void;
  /** Notify parent after an allergen-removal audit entry persists so the
   *  per-recipe history view can refetch. */
  onAllergenAudit?: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// AnalysisSection — editor block for the recipe's calories + tags + allergens.
// The "Analyse with AI" button asks Groq to fill the section from the current
// ingredient list; every field is editable afterwards so the chef has the
// final say. Tags + allergens are reflected as removable pills.
// ---------------------------------------------------------------------------
export default function AnalysisSection({ recipe, onChange, onAllergenAudit }: Props) {
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  const profileDisplayName = useProfileStore((s) => s.displayName);
  const { user } = useUser();
  // See Workflow.tsx comment — proxy mode skips the Groq-key gate.
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasKey = isProxyMode || apiKey.length > 0;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [newTagDraft, setNewTagDraft] = useState('');
  const [pendingRemovalTag, setPendingRemovalTag] = useState<AllergenTag | null>(null);

  const analysis: RecipeAnalysis = recipe.analysis ?? {};
  const tags = analysis.keyIngredientTags ?? [];
  const allergens = analysis.allergens ?? [];

  // Map every spelling we'll accept (kebab key + display label, lowercased)
  // back to the canonical AllergenTag, so "Eggs", "eggs", and "egg" all hit.
  const allergenLookup = new Map<string, AllergenTag>();
  for (const t of ALLERGEN_TAGS) {
    allergenLookup.set(t.toLowerCase(), t);
    allergenLookup.set(ALLERGEN_LABEL[t].toLowerCase(), t);
  }

  async function handleAnalyze() {
    if (!hasKey) {
      setStatus({ kind: 'error', message: 'No Groq API key — open Workflow → Connect Groq to add one.' });
      return;
    }
    setStatus({ kind: 'analyzing' });
    try {
      const next = await analyzeRecipe({ recipe, apiKey, model });
      onChange(next);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  function patch(next: Partial<RecipeAnalysis>) {
    onChange({ ...analysis, ...next });
  }

  function setKcalPerPortion(raw: string) {
    if (raw === '') return patch({ caloriesPerPortion: undefined });
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) patch({ caloriesPerPortion: n });
  }

  function setKcalTotal(raw: string) {
    if (raw === '') return patch({ caloriesTotal: undefined });
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) patch({ caloriesTotal: n });
  }

  // Smart classification: matches the input against the closed allergen
  // taxonomy (by kebab key or display label); anything else becomes a free
  // ingredient tag. Keeps the v1 add-flow to ONE input field.
  function addTag() {
    const raw = newTagDraft.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const allergenMatch = allergenLookup.get(lower);
    if (allergenMatch) {
      if (!allergens.includes(allergenMatch)) {
        patch({ allergens: [...allergens, allergenMatch] });
      }
    } else {
      if (!tags.includes(lower)) {
        patch({ keyIngredientTags: [...tags, lower] });
      }
    }
    setNewTagDraft('');
  }

  function removeTag(tag: string) {
    patch({ keyIngredientTags: tags.filter((t) => t !== tag) });
  }

  function requestRemoveAllergen(tag: AllergenTag) {
    // Safety-critical: do NOT patch immediately. Open the removal modal so
    // the chef has to confirm reason + cooldown before the tag is stripped.
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
      setStatus({ kind: 'error', message: 'Could not record audit entry — allergen tag was NOT removed.' });
      setPendingRemovalTag(null);
      return;
    }
    patch({ allergens: allergens.filter((a) => a !== tag) });
    setPendingRemovalTag(null);
    onAllergenAudit?.();
    // Best-effort sync to the central log — never blocks the user flow.
    // Anonymous removals (no userClerkId) skip the push entirely.
    void pushAllergenAudit(entry).then((ok) => {
      if (ok) void markAuditSynced(entry.id);
    });
  }

  const isAllergenPreview = (() => {
    const lower = newTagDraft.trim().toLowerCase();
    if (!lower) return null;
    return allergenLookup.get(lower) ?? null;
  })();

  return (
    <>
    <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="flex items-center justify-between gap-2 mb-3">
        <legend className="text-sm font-medium px-1">Analysis</legend>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={status.kind === 'analyzing'}
          className="btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Sparkles className={`h-3.5 w-3.5 ${status.kind === 'analyzing' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {status.kind === 'analyzing' ? 'Analysing…' : 'Analyse with AI'}
        </button>
      </div>

      {status.kind === 'error' && (
        <div
          role="status"
          className="mb-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
        >
          <p className="font-medium inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Couldn't analyse the recipe
          </p>
          <p className="mt-1 text-xs whitespace-pre-wrap">{status.message}</p>
        </div>
      )}

      {/* Calories */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Calories / portion (kcal)</span>
          <input
            type="number"
            min={0}
            value={analysis.caloriesPerPortion ?? ''}
            onChange={(e) => setKcalPerPortion(e.target.value)}
            placeholder="—"
            className="input mt-1"
            aria-label="Calories per portion"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Calories total (kcal)</span>
          <input
            type="number"
            min={0}
            value={analysis.caloriesTotal ?? ''}
            onChange={(e) => setKcalTotal(e.target.value)}
            placeholder="—"
            className="input mt-1"
            aria-label="Calories total"
          />
        </label>
      </div>

      {/* Tags — key ingredients + allergens combined */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1.5">Tags</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length === 0 && allergens.length === 0 && (
            <span className="text-xs text-slate-500 italic">None — add tags or run Analyse.</span>
          )}
          {/* Allergens first so safety-critical pills are visually anchored. */}
          {allergens.map((a) => (
            <EditablePill
              key={`allergen-${a}`}
              variant="allergen"
              onRemove={() => requestRemoveAllergen(a)}
              ariaLabel={`Remove allergen ${ALLERGEN_LABEL[a]}`}
              title={`${ALLERGEN_LABEL[a]} — ${ALLERGEN_EXAMPLES[a]}`}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {ALLERGEN_LABEL[a]}
            </EditablePill>
          ))}
          {tags.map((t) => (
            <EditablePill
              key={`tag-${t}`}
              variant="key"
              onRemove={() => removeTag(t)}
              ariaLabel={`Remove tag ${t}`}
            >
              {t}
            </EditablePill>
          ))}
          {/* Read-only chips lifted from each `#`-linked sub-recipe's own
              analysis. Same visual as the editable allergen/key pills, but
              no remove X (chef edits the SOURCE sub-recipe to change them).
              Hover/focus the chip → title attribute names the source. */}
          <SubRecipeInheritedChips recipe={recipe} />
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newTagDraft}
            onChange={(e) => setNewTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag — e.g. beef, miso, eggs, gluten…"
            className="input flex-1 text-sm"
            aria-label="Add a tag"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={newTagDraft.trim().length === 0}
            className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {isAllergenPreview ? (
            <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Will be added as the <strong>{ALLERGEN_LABEL[isAllergenPreview]}</strong> allergen.
            </span>
          ) : (
            <>Names matching a UK-14 allergen (eggs, milk, fish, gluten, sulphites…) are flagged with a red warning border; anything else becomes an ingredient tag.</>
          )}
        </p>
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
// EditablePill — pill with a removable X. Two variants:
//   - "key" : black border / text (matches RecipeCard's KeyTagPill)
//   - "allergen" : red border / text (matches RecipeCard's AllergenPill)
// ---------------------------------------------------------------------------
function EditablePill({
  variant,
  onRemove,
  ariaLabel,
  title,
  children,
}: {
  variant: 'key' | 'allergen';
  onRemove: () => void;
  ariaLabel: string;
  title?: string;
  children: React.ReactNode;
}) {
  const baseClass = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border';
  const variantClass = variant === 'key'
    ? 'border-slate-900 dark:border-slate-200 text-slate-900 dark:text-slate-200'
    : 'border-red-600 text-red-700 dark:text-red-300 dark:border-red-500';
  return (
    <span className={`${baseClass} ${variantClass}`} title={title}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel}
        className="ml-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/401/.test(m)) return 'Invalid API key. Check your Groq key in Workflow → Connect Groq.';
    if (/429/.test(m)) return 'Rate limited by Groq. Wait a minute and try again.';
    return m;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// SubRecipeInheritedChips — read-only chips lifted from each `#`-linked
// sub-recipe's analysis. Rendered INLINE in the parent's Tags row alongside
// the editable allergen + key-ingredient pills. Visual is the same red /
// black pill shape so the row reads as one cohesive list; the absence of
// the remove X is the only signal that these came from a sub-recipe.
// `title` attribute names the source so hover/long-press surfaces it.
//
// We don't dedup against the parent's own tags — both can coexist (e.g.
// "Milk" appearing twice because both this recipe and the sauce contribute).
// The chef can spot duplicates visually; hiding them would mask provenance.
// ---------------------------------------------------------------------------
interface InheritedChip {
  /** Stable key for React. */
  id: string;
  kind: 'allergen' | 'key';
  /** For allergens, the kebab tag (e.g. 'milk'); for keys, the lowercase string. */
  value: string;
  /** Source sub-recipe title — for the title attribute. */
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
        for (const a of sub.analysis?.allergens ?? []) {
          next.push({ id: `${sub.id}-a-${a}`, kind: 'allergen', value: a, source: title });
        }
        for (const t of sub.analysis?.keyIngredientTags ?? []) {
          next.push({ id: `${sub.id}-t-${t}`, kind: 'key', value: t, source: title });
        }
      }
      setChips(next);
    });
    return () => { cancelled = true; };
  }, [recipe.ingredients]);

  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) =>
        c.kind === 'allergen' ? (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full border border-red-600
                       text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
            title={`Inherited from ${c.source}`}
            data-testid={`analysis-inherited-allergen-${c.value}`}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {ALLERGEN_LABEL[c.value as AllergenTag] ?? c.value}
          </span>
        ) : (
          <span
            key={c.id}
            className="inline-flex items-center rounded-full border border-slate-900 dark:border-slate-200
                       text-slate-900 dark:text-slate-200 px-2 py-0.5 text-xs"
            title={`Inherited from ${c.source}`}
            data-testid={`analysis-inherited-key-${c.value}`}
          >
            {c.value}
          </span>
        ),
      )}
    </>
  );
}
