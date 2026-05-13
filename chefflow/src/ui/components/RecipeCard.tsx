import { Link } from 'react-router-dom';
import type { Recipe } from '../../core/types';

interface Props {
  recipe: Recipe;
  onDuplicate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}

export default function RecipeCard({ recipe, onDuplicate, onDelete }: Props) {
  return (
    <article className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-kitchen-ink">
      <header className="flex items-start justify-between gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="text-lg font-semibold hover:text-accent">
          {recipe.title || 'Untitled recipe'}
        </Link>
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
      <footer className="mt-3 flex gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary text-sm">Edit</Link>
        <button type="button" onClick={() => onDuplicate(recipe)} className="btn-secondary text-sm">
          Duplicate
        </button>
        <button type="button" onClick={() => onDelete(recipe)} className="btn-danger text-sm">
          Delete
        </button>
      </footer>
    </article>
  );
}
