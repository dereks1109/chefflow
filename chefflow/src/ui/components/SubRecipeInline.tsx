import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { getRecipe } from '../../db/recipesRepo';
import type { Recipe } from '../../core/types';

interface Props {
  recipeId: string;
}

/**
 * Read-only inline view of a sub-recipe. Loads the referenced recipe by id
 * and renders ingredients + steps. Used in the parent recipe editor when
 * the chef expands a `#` ingredient row.
 */
export default function SubRecipeInline({ recipeId }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getRecipe(recipeId)
      .then((r) => { if (!cancelled) setRecipe(r ?? null); })
      .catch(() => { if (!cancelled) setRecipe(null); });
    return () => { cancelled = true; };
  }, [recipeId]);

  if (recipe === undefined) {
    return (
      <div className="mt-2 text-xs text-slate-500 px-3 py-2 rounded-md bg-slate-50 dark:bg-surface-2 border border-slate-200 dark:border-slate-700">
        Loading sub-recipe…
      </div>
    );
  }

  if (recipe === null) {
    return (
      <div
        role="alert"
        className="mt-2 text-xs text-amber-700 dark:text-amber-300 px-3 py-2 rounded-md border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 inline-flex items-start gap-1.5"
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>Referenced recipe not found. It may have been deleted — remove the <code>#</code> or pick a new one.</span>
      </div>
    );
  }

  return (
    <article
      data-testid={`sub-recipe-inline-${recipe.id}`}
      className="mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-2 p-3 text-sm"
    >
      <header className="flex items-baseline justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{recipe.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}
            {recipe.prepTime ? ` · prep ${recipe.prepTime}` : ''}
            {recipe.cookTime ? ` · cook ${recipe.cookTime}` : ''}
          </p>
        </div>
        <Link
          to={`/recipes/${recipe.id}/edit`}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          Open recipe
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>

      {recipe.ingredients.length > 0 && (
        <section className="mt-2">
          <h4 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Ingredients</h4>
          <ul className="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
            {recipe.ingredients.map((i) => (
              <li key={i.id}>
                {i.amount > 0 && <span className="font-mono mr-1">{i.amount}{i.unit}</span>}
                {i.name || <em className="text-slate-400">unnamed</em>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section className="mt-3">
          <h4 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Steps</h4>
          <ol className="list-decimal list-inside space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
            {recipe.steps.map((s) => (
              <li key={s.id} className="leading-relaxed">{s.text}</li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
