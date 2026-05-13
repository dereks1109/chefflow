import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import type { Recipe, Ingredient, WorkflowStep } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);

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

  async function handleSave() {
    await saveRecipe({ ...r, updatedAt: Date.now() });
    setDirty(false);
    navigate('/recipes');
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate('/recipes');
  }

  return (
    <section className="p-4 md:p-6">
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">Edit recipe</h1>
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
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={r.title}
            onChange={(e) => update('title', e.target.value)}
            className="input mt-1"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
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
              {r.ingredients.map((ing, i) => (
                <IngredientRow
                  key={ing.id}
                  index={i}
                  value={ing}
                  onChange={(next) => updateIngredient(i, next)}
                  onRemove={() => removeIngredient(i)}
                />
              ))}
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
