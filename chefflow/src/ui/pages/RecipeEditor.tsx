import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import type { Recipe, Ingredient } from '../../core/types';

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
          <label className="block">
            <span className="text-sm font-medium">Prep time</span>
            <input
              type="text"
              placeholder="30m"
              value={r.prepTime ?? ''}
              onChange={(e) => update('prepTime', e.target.value || undefined)}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Cook time</span>
            <input
              type="text"
              placeholder="2h"
              value={r.cookTime ?? ''}
              onChange={(e) => update('cookTime', e.target.value || undefined)}
              className="input mt-1"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Ingredients</legend>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {r.ingredients.map((ing, i) => (
              <IngredientRow
                key={ing.id}
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
      </form>
    </section>
  );
}
