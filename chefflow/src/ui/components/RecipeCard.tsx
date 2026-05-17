import { Link } from 'react-router-dom';
import { AllergenPill, KeyTagPill } from './AllergenBadge';
import type { Recipe } from '../../core/types';

interface Props {
  recipe: Recipe;
  onTogglePin: (r: Recipe) => void;
  onDuplicate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}

function isDemo(recipe: Recipe): boolean {
  return recipe.id.startsWith('r_demo_');
}

export default function RecipeCard({ recipe, onTogglePin, onDuplicate, onDelete }: Props) {
  const pinned = Boolean(recipe.isPinned);
  return (
    <article className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-kitchen-ink">
      <header className="flex items-start justify-between gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="text-lg font-semibold hover:text-accent flex-1 min-w-0">
          {recipe.title || 'Untitled recipe'}
        </Link>
        <button
          type="button"
          onClick={() => onTogglePin(recipe)}
          className={`touch-target px-3 rounded-md text-lg shrink-0 ${
            pinned
              ? 'bg-accent text-white'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
          aria-label={pinned ? 'Unpin recipe' : 'Pin recipe to top'}
          aria-pressed={pinned}
          title={pinned ? 'Pinned — click to unpin' : 'Pin to top'}
        >
          📌
        </button>
      </header>
      <dl className="mt-2 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
        <div>
          <dt className="sr-only">Yield</dt>
          <dd>{recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}</dd>
        </div>
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
      {recipe.analysis && <RecipeAnalysisRow analysis={recipe.analysis} />}
      <footer className="mt-3 flex gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary text-sm">Edit</Link>
        <button type="button" onClick={() => onDuplicate(recipe)} className="btn-secondary text-sm">
          Duplicate
        </button>
        {!isDemo(recipe) && (
          <button type="button" onClick={() => onDelete(recipe)} className="btn-danger text-sm">
            Delete
          </button>
        )}
      </footer>
    </article>
  );
}

function RecipeAnalysisRow({ analysis }: { analysis: NonNullable<Recipe['analysis']> }) {
  const kcal = analysis.caloriesPerPortion;
  const keyTags = analysis.keyIngredientTags ?? [];
  const allergens = analysis.allergens ?? [];
  if (kcal === undefined && keyTags.length === 0 && allergens.length === 0) return null;
  return (
    <section className="mt-2 flex flex-wrap gap-1.5" aria-label="Recipe tags">
      {/* Allergens first — safety-critical info gets the most visible slot. */}
      {allergens.map((a) => (
        <AllergenPill key={a} tag={a} />
      ))}
      {kcal !== undefined && (
        <span
          className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800
                     text-slate-700 dark:text-slate-300 px-2 py-0.5 text-xs font-medium"
          title="Calories per portion (LLM estimate)"
        >
          ~{kcal} kcal/portion
        </span>
      )}
      {keyTags.map((t) => (
        <KeyTagPill key={t}>{t}</KeyTagPill>
      ))}
    </section>
  );
}
