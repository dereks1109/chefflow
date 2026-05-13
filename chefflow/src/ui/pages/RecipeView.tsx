import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRecipe } from '../../db/recipesRepo';
import { scaleRecipe } from '../../core/scaler/scaleRecipe';
import { useUnitSystemStore } from '../../state/unitSystemStore';
import type { Recipe } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeView() {
  const { id = '' } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [targetPortions, setTargetPortions] = useState<number | null>(null);
  const system = useUnitSystemStore((s) => s.system);

  useEffect(() => {
    let cancelled = false;
    getRecipe(id).then((recipe) => {
      if (cancelled) return;
      if (!recipe) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'ready', recipe });
        setTargetPortions(recipe.originalYield);
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
        <Link to="/recipes" className="btn-secondary mt-4 inline-flex">Back to library</Link>
      </div>
    );
  }

  const recipe = state.recipe;
  const portions = targetPortions ?? recipe.originalYield;
  const scaled = scaleRecipe(recipe, { targetPortions: portions, system });

  return (
    <section className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link to="/recipes" className="btn-secondary text-sm">← Library</Link>
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary">Edit</Link>
      </header>

      <h1 className="text-2xl font-bold">{recipe.title || 'Untitled recipe'}</h1>

      <dl className="text-sm text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
        {recipe.prepTime && (
          <div>
            <dt className="sr-only">Prep</dt>
            <dd>Prep {recipe.prepTime}</dd>
          </div>
        )}
        {recipe.cookTime && (
          <div>
            <dt className="sr-only">Cook</dt>
            <dd>Cook {recipe.cookTime}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Servings</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTargetPortions(Math.max(1, portions - 1))}
            className="touch-target px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-lg"
            aria-label="Decrease servings"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={portions}
            onChange={(e) => setTargetPortions(Math.max(1, Number(e.target.value) || 1))}
            className="input w-20 text-center"
            aria-label="Servings"
          />
          <button
            type="button"
            onClick={() => setTargetPortions(portions + 1)}
            className="touch-target px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-lg"
            aria-label="Increase servings"
          >
            +
          </button>
        </div>
        {portions !== recipe.originalYield && (
          <span className="text-sm text-slate-500">scaled from {recipe.originalYield}</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <section>
          <h2 className="text-sm font-medium mb-2">Ingredients</h2>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {scaled.ingredients.map((ing) => (
              <li key={ing.id} className="py-2 flex items-baseline gap-2">
                {ing.isLocked && (
                  <span aria-label="Locked — does not scale" title="Locked — does not scale">
                    🔒
                  </span>
                )}
                <span className="font-mono text-sm">{ing.amount}</span>
                <span className="text-sm">{ing.unit}</span>
                <span className="flex-1">{ing.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-2">Workflow</h2>
          <ol className="space-y-2">
            {scaled.steps.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="font-semibold w-6 shrink-0">{i + 1}.</span>
                <span className="flex-1 whitespace-pre-wrap">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
