import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Edit3, Lock, Minus, Plus, Users } from 'lucide-react';
import { getRecipe } from '../../db/recipesRepo';
import { scaleRecipe } from '../../core/scaler/scaleRecipe';
import { useUnitSystemStore } from '../../state/unitSystemStore';
import { AllergenPill, KeyTagPill } from '../components/AllergenBadge';
import FoodSafetyAdvisory from '../components/FoodSafetyAdvisory';
import type { Recipe } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

// Read-only "cook this" view. The Servings stepper drives scaleRecipe()
// on every change; locked ingredients (salt, spices) pass through
// untouched so they don't over-scale at 10×. The page never writes to
// Dexie — the user's edits happen in /recipes/:id/edit.
export default function RecipeView() {
  const { id = '' } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [targetPortions, setTargetPortions] = useState<number | null>(null);
  const system = useUnitSystemStore((s) => s.system);

  useEffect(() => {
    let cancelled = false;
    void getRecipe(id).then((recipe) => {
      if (cancelled) return;
      if (!recipe) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'ready', recipe });
        setTargetPortions(recipe.originalYield);
      }
    });
    return () => { cancelled = true; };
  }, [id]);

  const scaled = useMemo(() => {
    if (state.kind !== 'ready' || targetPortions === null) return null;
    return scaleRecipe(state.recipe, { targetPortions, system });
  }, [state, targetPortions, system]);

  if (state.kind === 'loading') {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }
  if (state.kind === 'not-found') {
    return (
      <section className="p-4 md:p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <Link to="/recipes" className="btn-secondary mt-4 inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to library
        </Link>
      </section>
    );
  }

  const recipe = state.recipe;
  const portions = targetPortions ?? recipe.originalYield;
  const view = scaled ?? recipe;
  const analysis = recipe.analysis;
  const hasAnalysis =
    analysis && (
      analysis.caloriesPerPortion !== undefined ||
      (analysis.keyIngredientTags?.length ?? 0) > 0 ||
      (analysis.allergens?.length ?? 0) > 0
    );

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/recipes"
          className="btn-secondary text-sm inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Library
        </Link>
        <Link
          to={`/recipes/${recipe.id}/edit`}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          Edit
        </Link>
      </header>

      <div>
        <h1 className="text-3xl font-bold">{recipe.title || 'Untitled recipe'}</h1>
        <dl className="mt-2 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <dt className="sr-only">Yield</dt>
            <dd>
              {recipe.originalYield} original portion{recipe.originalYield === 1 ? '' : 's'}
            </dd>
          </div>
          {recipe.prepTime && (
            <div className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <dt className="sr-only">Prep</dt>
              <dd>Prep {recipe.prepTime}</dd>
            </div>
          )}
          {recipe.cookTime && (
            <div className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <dt className="sr-only">Cook</dt>
              <dd>Cook {recipe.cookTime}</dd>
            </div>
          )}
        </dl>
      </div>

      {hasAnalysis && (
        <div>
          <section className="flex flex-wrap gap-1.5" aria-label="Recipe analysis">
            {analysis!.allergens?.map((a) => <AllergenPill key={a} tag={a} />)}
            {analysis!.caloriesPerPortion !== undefined && (
              <span
                className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800
                           text-slate-700 dark:text-slate-300 px-2 py-0.5 text-xs font-medium"
                title="Calories per portion (LLM estimate). Scales with servings."
              >
                ~{Math.round((analysis!.caloriesPerPortion ?? 0))} kcal/portion
              </span>
            )}
            {analysis!.keyIngredientTags?.map((t) => <KeyTagPill key={t}>{t}</KeyTagPill>)}
          </section>
          {(analysis!.allergens?.length ?? 0) > 0 && (
            <div className="mt-2">
              <FoodSafetyAdvisory variant="block" />
            </div>
          )}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200
                   dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4"
      >
        <label htmlFor="servings-input" className="text-sm font-medium">
          Servings
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTargetPortions(Math.max(1, portions - 1))}
            disabled={portions <= 1}
            className="touch-target px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-lg
                       disabled:opacity-40 disabled:cursor-not-allowed
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Decrease servings"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            id="servings-input"
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
            className="touch-target px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-lg
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Increase servings"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {portions !== recipe.originalYield && (
          <span className="text-xs text-slate-500 italic">
            scaled from {recipe.originalYield}× (locked items unchanged)
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Ingredients
          </h2>
          {view.ingredients.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No ingredients listed.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {view.ingredients.map((ing) => (
                <li key={ing.id} className="py-2 flex items-baseline gap-2">
                  {ing.isLocked && (
                    <Lock
                      className="h-3 w-3 mt-0.5 text-slate-400 shrink-0"
                      aria-label="Locked — does not scale with servings"
                    />
                  )}
                  <span className="font-mono text-sm tabular-nums shrink-0">
                    {ing.amount}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">
                    {ing.unit}
                  </span>
                  <span className="flex-1">{ing.name || <em className="text-slate-400">unnamed</em>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Steps
          </h2>
          {view.steps.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No steps listed.</p>
          ) : (
            <ol className="space-y-2">
              {view.steps.map((s, i) => (
                <li key={s.id} className="flex gap-2">
                  <span className="font-semibold w-6 shrink-0 text-slate-500">{i + 1}.</span>
                  <span className="flex-1 whitespace-pre-wrap">{s.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
