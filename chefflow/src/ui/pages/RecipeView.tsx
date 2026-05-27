import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3 } from 'lucide-react';
import { getRecipe } from '../../db/recipesRepo';
import { getRecipeAllergens } from '../../core/recipes/llm/allergens';
import { AllergenPill } from '../components/AllergenBadge';
import AllergenHistorySection from '../components/AllergenHistorySection';
import type { Recipe } from '../../core/types';

// ---------------------------------------------------------------------------
// RecipeView — read-only view of a recipe. Mirrors the events pattern
// (/events/:id is EventView read mode; /events/:id/edit is EventEditor).
// Clicking a recipe card now lands here first; "Edit" button promotes to
// the editor. Same posture as CommunityRecipeView for recipes the chef
// browsed but didn't author.
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

function ingredientsFlaggedWith(recipe: Recipe, tag: string): string[] {
  return recipe.ingredients
    .filter((i) => i.allergenFlags?.includes(tag as never))
    .map((i) => i.name)
    .filter((n): n is string => Boolean(n));
}

export default function RecipeView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void getRecipe(id).then((recipe) => {
      if (cancelled) return;
      setState(recipe ? { kind: 'ready', recipe } : { kind: 'not-found' });
    });
    return () => { cancelled = true; };
  }, [id]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <section className="p-6">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <button
          type="button"
          onClick={() => navigate('/recipes')}
          className="btn-secondary mt-4 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to library
        </button>
      </section>
    );
  }

  const r = state.recipe;
  const allergens = getRecipeAllergens(r);
  const otherTags = r.otherTags ?? [];
  const analysis = r.analysis ?? {};

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto" data-testid="recipe-view">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/recipes')}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to library
        </button>
        <button
          type="button"
          onClick={() => navigate(`/recipes/${r.id}/edit`)}
          data-testid="recipe-view-edit"
          className="btn-primary inline-flex items-center gap-1.5 text-sm"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
      </div>

      {r.coverPhoto && (
        <img
          src={r.coverPhoto}
          alt={`${r.title} cover photo`}
          className="w-full aspect-video object-cover rounded-md mb-4"
        />
      )}

      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold" data-testid="recipe-view-title">
          {r.title || 'Untitled recipe'}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Yields {r.originalYield} portion{r.originalYield === 1 ? '' : 's'}
          {typeof r.pricePerPortion === 'number' && r.pricePerPortion > 0 && (
            <> · £{r.pricePerPortion.toFixed(2)} / portion</>
          )}
          {r.prepTime && <> · Prep {r.prepTime}</>}
          {r.cookTime && <> · Cook {r.cookTime}</>}
        </p>
        {r.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {r.description}
          </p>
        )}
      </header>

      {(allergens.length > 0 || otherTags.length > 0) && (
        <section className="mb-4 flex flex-wrap gap-1.5" aria-label="Recipe allergens and tags">
          {allergens.map((a) => (
            <AllergenPill key={a} tag={a} ingredients={ingredientsFlaggedWith(r, a)} />
          ))}
          {otherTags.map((t) => (
            <span
              key={`o-${t}`}
              className="inline-flex items-center rounded-full border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-2 py-0.5 text-xs"
            >
              {t}
            </span>
          ))}
        </section>
      )}

      {(analysis.caloriesPerPortion !== undefined || analysis.caloriesTotal !== undefined) && (
        <p className="mb-4 text-xs text-slate-500">
          {analysis.caloriesPerPortion !== undefined && (
            <>{analysis.caloriesPerPortion} kcal / portion</>
          )}
          {analysis.caloriesPerPortion !== undefined && analysis.caloriesTotal !== undefined && ' · '}
          {analysis.caloriesTotal !== undefined && (
            <>{analysis.caloriesTotal} kcal total</>
          )}
          <span className="ml-1 text-slate-400">(AI estimate)</span>
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold mb-2">Ingredients</h2>
          {r.ingredients.length === 0 ? (
            <p className="text-sm text-slate-500">No ingredients listed.</p>
          ) : (
            <ul className="space-y-1 text-sm" data-testid="recipe-view-ingredients">
              {r.ingredients.map((ing) => (
                <li key={ing.id} className="border-b border-slate-100 dark:border-slate-800 py-1">
                  {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
                  {ing.name || ing.raw}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Steps</h2>
          {r.steps.length === 0 ? (
            <p className="text-sm text-slate-500">No steps listed.</p>
          ) : (
            <ol className="space-y-2 text-sm list-decimal list-inside" data-testid="recipe-view-steps">
              {r.steps.map((s) => (
                <li key={s.id} className="leading-relaxed">{s.text}</li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="mt-6">
        <AllergenHistorySection recipeId={r.id} refreshKey={0} />
      </div>
    </section>
  );
}
