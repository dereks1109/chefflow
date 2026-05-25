import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { getRecipe } from '../../db/recipesRepo';
import type { Recipe } from '../../core/types';

interface Props {
  subRecipeId: string;
}

/**
 * Collapsible card rendered ABOVE the parent recipe's Steps fieldset. One per
 * `#`-linked sub-recipe; lists the sub-recipe's steps read-only so chefs can
 * see what runs before their own steps without leaving the editor. Mirrors
 * [SubRecipeInline.tsx] but is steps-only + has the expand/collapse toggle.
 *
 * Read-only by design — the parent editor doesn't edit sub-recipes inline.
 * The "Open recipe" link in the header navigates to the sub-recipe's own
 * editor for actual edits.
 */
export default function SubRecipeStepsPanel({ subRecipeId }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRecipe(subRecipeId)
      .then((r) => { if (!cancelled) setRecipe(r ?? null); })
      .catch(() => { if (!cancelled) setRecipe(null); });
    return () => { cancelled = true; };
  }, [subRecipeId]);

  if (recipe === undefined) {
    return (
      <div className="text-xs text-slate-500 px-3 py-2 rounded-md bg-slate-50 dark:bg-surface-2 border border-slate-200 dark:border-slate-700">
        Loading sub-recipe…
      </div>
    );
  }

  if (recipe === null) {
    return (
      <div
        role="alert"
        className="text-xs text-amber-700 dark:text-amber-300 px-3 py-2 rounded-md border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 inline-flex items-start gap-1.5"
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>Sub-recipe not found — it may have been deleted.</span>
      </div>
    );
  }

  const stepCount = recipe.steps.length;

  return (
    <article
      data-testid={`sub-recipe-steps-${recipe.id}`}
      className="rounded-md border border-slate-200 dark:border-slate-700 border-l-2 border-l-accent/40 dark:border-l-accent/60 bg-slate-50 dark:bg-surface-2"
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`sub-recipe-steps-body-${recipe.id}`}
          className="flex items-center gap-1.5 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
            {recipe.title}
          </span>
          <span className="text-xs text-slate-500">
            ({stepCount} step{stepCount === 1 ? '' : 's'})
          </span>
        </button>
        <Link
          to={`/recipes/${recipe.id}/edit`}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>

      {open && stepCount > 0 && (
        <div
          id={`sub-recipe-steps-body-${recipe.id}`}
          className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-700"
        >
          <ol className="list-decimal list-inside space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
            {recipe.steps.map((s) => (
              <li key={s.id} className="leading-relaxed">{s.text}</li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}
