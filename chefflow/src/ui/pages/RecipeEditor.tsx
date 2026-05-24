import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import AnalysisSection from '../components/AnalysisSection';
import VerificationToggle from '../components/VerificationToggle';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import { getPrefs } from '../../db/prefsRepo';
import { findAllergensInIngredient } from '../../core/recipes/llm/allergens';
import { loadReviewDraft } from '../../core/events/reviewDraft';
import type { Recipe, RecipeAnalysis, Ingredient, WorkflowStep } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);
  const [chefName, setChefName] = useState('');

  useEffect(() => {
    // Display-name preference takes priority; fall back to Clerk's name.
    let cancelled = false;
    void getPrefs().then((prefs) => {
      if (cancelled) return;
      const fromPrefs = prefs?.displayName?.trim();
      const fromClerk = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
      setChefName(fromPrefs || fromClerk || '');
    });
    return () => { cancelled = true; };
  }, [user]);

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
    // Clear verification when a safety-relevant field changes — chef must
    // re-confirm after edits to ingredients or the AI-generated analysis.
    const clearsVerification = key === 'ingredients' || key === 'analysis';
    const nextRecipe: Recipe = clearsVerification
      ? { ...r, [key]: value, verifiedAt: undefined, verifiedBy: undefined }
      : { ...r, [key]: value };
    setState({ kind: 'ready', recipe: nextRecipe });
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

  return (
    <section className="p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Edit recipe</h1>
          <VerificationToggle
            verifiedAt={r.verifiedAt}
            verifiedBy={r.verifiedBy}
            chefName={chefName}
            onChange={(next) => {
              setState({ kind: 'ready', recipe: { ...r, ...next } });
              setDirty(true);
            }}
            label="this recipe"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} className="btn-primary">
            Save
          </button>
        </div>
      </header>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AnalysisSection recipe={r} onChange={updateAnalysis} />

        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={r.title}
            onChange={(e) => update('title', e.target.value)}
            className="input mt-1"
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
            <ul>
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
