import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import AnalysisSection from '../components/AnalysisSection';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import { findAllergensInIngredient } from '../../core/recipes/llm/allergens';
import { loadReviewDraft } from '../../core/events/reviewDraft';
import { publishRecipe, unpublishRecipe } from '../../core/community/communityClient';
import { usePublishedSet } from '../../state/usePublishedSet';
import { useProfileStore } from '../../state/useProfileStore';
import { useAuthGate } from '../../state/useAuthGate';
import type { Recipe, RecipeAnalysis, Ingredient, WorkflowStep } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const requireAuth = useAuthGate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const displayName = useProfileStore((s) => s.displayName);
  const communityId = usePublishedSet((s) => s.map[id]);
  const linkPublished = usePublishedSet((s) => s.link);
  const unlinkPublished = usePublishedSet((s) => s.unlink);

  useEffect(() => {
    let cancelled = false;
    getRecipe(id).then((recipe) => {
      if (cancelled) return;
      if (!recipe) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'ready', recipe });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <button type="button" onClick={() => navigate('/recipes')} className="btn-secondary mt-4">
          Back to library
        </button>
      </div>
    );
  }

  const r = state.recipe;

  function update<K extends keyof Recipe>(key: K, value: Recipe[K]) {
    setState({ kind: 'ready', recipe: { ...r, [key]: value } });
    setDirty(true);
  }

  function updateIngredient(idx: number, next: Ingredient) {
    const nextList = r.ingredients.slice();
    nextList[idx] = next;
    update('ingredients', nextList);
  }

  function addIngredient() {
    update('ingredients', [...r.ingredients, blankIngredient()]);
  }

  function removeIngredient(idx: number) {
    update('ingredients', r.ingredients.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, next: WorkflowStep) {
    const nextList = r.steps.slice();
    nextList[idx] = next;
    update('steps', nextList);
  }

  function addStep() {
    update('steps', [...r.steps, blankStep()]);
  }

  function removeStep(idx: number) {
    update('steps', r.steps.filter((_, i) => i !== idx));
  }

  function updateAnalysis(next: RecipeAnalysis) {
    update('analysis', next);
  }

  // If the chef arrived here from the New-Event review flow ("Create new
  // recipe" on an unmatched dish), there's a draft in sessionStorage tagged
  // with this recipe's id. Routing back to /events makes EventsLibrary
  // rehydrate the review sheet with the freshly-saved stub already linked.
  function returnRoute(): string {
    const draft = loadReviewDraft();
    return draft?.awaitingRecipeId === r.id ? '/events' : '/recipes';
  }

  async function handleSave() {
    if (!window.confirm('Save changes to this recipe?')) return;
    await saveRecipe({ ...r, updatedAt: Date.now() });
    setDirty(false);
    navigate(returnRoute());
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate(returnRoute());
  }

  async function handlePublish() {
    setShareError(null);
    setShareBusy(true);
    try {
      const { id: newCommunityId } = await publishRecipe(r, displayName);
      linkPublished(r.id, newCommunityId);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleUnpublish() {
    if (!communityId) return;
    if (!window.confirm('Unpublish this recipe from the community?')) return;
    setShareError(null);
    setShareBusy(true);
    try {
      await unpublishRecipe(communityId);
      unlinkPublished(r.id);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to unpublish');
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <section className="p-4 md:p-6">
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">Edit recipe</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {communityId ? (
            <>
              <span
                className="text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                data-testid="recipe-editor-published-badge"
              >
                Published
              </span>
              <button
                type="button"
                onClick={() => requireAuth(() => void handleUnpublish())}
                disabled={shareBusy}
                className="btn-secondary disabled:opacity-60"
                data-testid="recipe-editor-unpublish-btn"
              >
                Unpublish
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => requireAuth(() => void handlePublish())}
              disabled={shareBusy}
              className="btn-secondary disabled:opacity-60"
              data-testid="recipe-editor-publish-btn"
            >
              {shareBusy ? 'Publishing…' : 'Share publicly'}
            </button>
          )}
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} className="btn-primary">
            Save
          </button>
        </div>
      </header>
      {shareError && (
        <p className="mb-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {shareError}
        </p>
      )}

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AnalysisSection recipe={r} onChange={updateAnalysis} />

        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={r.title}
            onChange={(e) => update('title', e.target.value)}
            className="input mt-1"
            data-testid="recipe-editor-title-input"
          />
        </label>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Yield (portions)</span>
            <input
              type="number"
              min={1}
              value={r.originalYield}
              onChange={(e) => update('originalYield', Math.max(1, Number(e.target.value)))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Price / portion (£)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={r.pricePerPortion ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') return update('pricePerPortion', undefined);
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0) update('pricePerPortion', n);
              }}
              placeholder="—"
              className="input mt-1"
              aria-label="Price per portion in GBP"
            />
          </label>
          <TimePicker
            label="Prep time"
            value={r.prepTime}
            onChange={(v) => update('prepTime', v)}
          />
          <TimePicker
            label="Cook time"
            value={r.cookTime}
            onChange={(v) => update('cookTime', v)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 items-start">
          <fieldset>
            <legend className="text-sm font-medium">Ingredients</legend>
            <p className="text-xs text-slate-500 mt-1 mb-2">
              Tip: type <code className="px-1 rounded bg-slate-100 dark:bg-surface-2">#</code> in an ingredient name to link another recipe (e.g. a sauce). The linked recipe expands inline and its steps merge into the kitchen timeline.
            </p>
            <ul className="space-y-3">
              {r.ingredients.map((ing, i) => {
                // User override wins; otherwise fall back to regex auto-detect
                // against the recipe's declared allergens.
                const effective = ing.allergenFlags
                  ?? findAllergensInIngredient(ing.name, r.analysis?.allergens ?? []);
                return (
                  <IngredientRow
                    key={ing.id}
                    index={i}
                    value={ing}
                    currentRecipeId={r.id}
                    onChange={(next) => updateIngredient(i, next)}
                    onRemove={() => removeIngredient(i)}
                    allergenMatches={effective}
                  />
                );
              })}
            </ul>
            <button type="button" onClick={addIngredient} className="btn-secondary mt-3">
              Add ingredient
            </button>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Steps</legend>
            <ul className="space-y-3">
              {r.steps.map((s, i) => (
                <StepRow
                  key={s.id}
                  index={i}
                  value={s}
                  onChange={(next) => updateStep(i, next)}
                  onRemove={() => removeStep(i)}
                />
              ))}
            </ul>
            <button type="button" onClick={addStep} className="btn-secondary mt-3">
              Add step
            </button>
          </fieldset>
        </div>
      </form>
    </section>
  );
}
