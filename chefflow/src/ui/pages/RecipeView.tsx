import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRecipe } from '../../db/recipesRepo';
import type { Recipe } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeView() {
  const { id = '' } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

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
        <Link to="/recipes" className="btn-secondary mt-4 inline-flex">Back to library</Link>
      </div>
    );
  }

  const recipe = state.recipe;

  return (
    <section className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link to="/recipes" className="btn-secondary text-sm">← Library</Link>
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary">Edit</Link>
      </header>

      <h1 className="text-2xl font-bold">{recipe.title}</h1>

      <dl className="text-sm text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
        <div>{recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}</div>
        {recipe.prepTime && <div>Prep {recipe.prepTime}</div>}
        {recipe.cookTime && <div>Cook {recipe.cookTime}</div>}
      </dl>

      <div className="grid gap-3 md:grid-cols-2 items-start">
        <section>
          <h2 className="text-sm font-medium mb-2">Ingredients</h2>
          <ol className="space-y-1">
            {recipe.ingredients.map((ing, i) => (
              <li key={ing.id} className="py-1 flex items-baseline gap-2">
                <span className="font-semibold w-6 text-sm">{i + 1}.</span>
                <span className="font-mono text-sm">{ing.amount}</span>
                <span className="text-sm">{ing.unit}</span>
                <span className="flex-1">{ing.name}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-2">Workflow</h2>
          <ol className="space-y-2">
            {recipe.steps.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="font-semibold w-6 pt-1 text-sm">{i + 1}.</span>
                <span className="flex-1">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
