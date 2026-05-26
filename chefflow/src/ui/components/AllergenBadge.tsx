import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from '../../core/recipes/llm/allergens';
import type { AllergenTag } from '../../core/types';

// AllergenPill is the only allergen surface that remains. The previous
// `UncertainAllergenPill` (amber "AI to review") was deleted along with the
// AI allergen-detection path — allergens are now user-declared only.

export function KeyTagPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-slate-900 dark:border-slate-200
                 text-slate-900 dark:text-slate-200 px-2 py-0.5 text-xs"
    >
      {children}
    </span>
  );
}

interface AllergenPillProps {
  tag: AllergenTag;
  /** Per-ingredient names this allergen is flagged on. When provided, the
   *  popover lists them; when empty, the popover explains it's a recipe-
   *  level declaration with no specific ingredient pinpointed. */
  ingredients?: string[];
}

export function AllergenPill({ tag, ingredients }: AllergenPillProps) {
  const label = ALLERGEN_LABEL[tag];
  const examples = ALLERGEN_EXAMPLES[tag];
  const [tappedOpen, setTappedOpen] = useState(false);
  const hasIngredients = ingredients && ingredients.length > 0;
  const causedBySummary = hasIngredients
    ? `Flagged on: ${ingredients!.join(', ')}`
    : 'Declared at recipe level by the chef.';

  return (
    <span className="relative inline-block group">
      <span
        // Always interactive — the popover always conveys useful information
        // (which ingredient row the chef flagged, or the recipe-level fallback).
        tabIndex={0}
        role="button"
        onClick={(e) => {
          e.preventDefault();
          setTappedOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-red-600
                   text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                   cursor-default"
        aria-label={`Allergen: ${label} (${examples}). ${causedBySummary}`}
        title={`${label} — ${examples}`}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <span
        role="tooltip"
        className={[
          'absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1',
          'px-2 py-1.5 rounded-md bg-slate-900 text-white text-[11px] leading-snug shadow-lg',
          'min-w-[8rem] max-w-[16rem] text-left whitespace-normal',
          'transition-opacity duration-150',
          tappedOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none',
        ].join(' ')}
      >
        {hasIngredients ? (
          <>
            <span className="block font-semibold mb-0.5">Flagged on</span>
            <ol className="list-decimal pl-4 space-y-0">
              {ingredients!.map((name, i) => (
                <li key={`${name}-${i}`}>{name}</li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <span className="block font-semibold mb-0.5">Declared at recipe level</span>
            <span className="block">
              No specific ingredient flagged — edit the recipe to tag one.
            </span>
          </>
        )}
      </span>
    </span>
  );
}
