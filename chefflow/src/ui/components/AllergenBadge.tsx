import { useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from '../../core/recipes/llm/allergens';
import type { AllergenTag } from '../../core/types';

// TODO(v2): pair AllergenPill with a "LLM-estimated — verify before serving"
// disclaimer in the editor. A missed allergen is a safety concern; the badge
// alone should not be treated as a regulatory declaration.

/**
 * Amber warning pill — surfaces ingredients the AI couldn't confidently
 * classify for allergens. Mirrors `AllergenPill` structure (always-rendered
 * tooltip + group hover/focus) but with amber styling + a HelpCircle icon
 * so chefs immediately see it's a "please double-check" signal, not an
 * allergen declaration.
 *
 * Callers should NOT render this pill when count === 0 — guard at the call
 * site so the test surface stays simple.
 */
interface UncertainAllergenPillProps {
  /** Number of uncertain ingredients (the pill body shows "AI to review (N)"). */
  count: number;
  /** Lowercase ingredient names listed in the tooltip body. */
  ingredients: string[];
}

export function UncertainAllergenPill({ count, ingredients }: UncertainAllergenPillProps) {
  const [tappedOpen, setTappedOpen] = useState(false);
  const summary = ingredients.length > 0
    ? `AI uncertain about: ${ingredients.join(', ')}. Please verify before serving.`
    : `${count} ingredient${count === 1 ? '' : 's'} the AI could not classify. Please verify.`;

  return (
    <span className="relative inline-block group" data-testid="recipe-card-uncertain-pill">
      <span
        tabIndex={0}
        role="button"
        onClick={(e) => {
          e.preventDefault();
          setTappedOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-amber-500
                   text-amber-700 dark:text-amber-300 dark:border-amber-600 px-2 py-0.5 text-xs
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                   cursor-default"
        aria-label={`AI to review (${count}). ${summary}`}
        title={summary}
      >
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
        AI to review ({count})
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
        <span className="block font-semibold mb-0.5">AI cannot recognise</span>
        {ingredients.length > 0 ? (
          <ol className="list-decimal pl-4 space-y-0">
            {ingredients.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ol>
        ) : (
          <span className="block">Please chef further check these ingredients.</span>
        )}
        <span className="block mt-1 italic opacity-80">
          Please chef further check the ingredient.
        </span>
      </span>
    </span>
  );
}

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
  /** Ingredient names that triggered this allergen for the parent recipe.
   *  When provided, the pill renders a hover/tap popover listing them. */
  ingredients?: string[];
}

export function AllergenPill({ tag, ingredients }: AllergenPillProps) {
  const label = ALLERGEN_LABEL[tag];
  const examples = ALLERGEN_EXAMPLES[tag];
  const [tappedOpen, setTappedOpen] = useState(false);
  const hasIngredients = ingredients && ingredients.length > 0;
  // Flat sr-only summary so screen readers don't iterate the styled list.
  const causedBySummary = hasIngredients
    ? `Caused by: ${ingredients!.join(', ')}`
    : 'Declared at recipe level — no specific ingredient identified.';

  return (
    <span className="relative inline-block group">
      <span
        // Always interactive — even an empty tooltip is informative ("declared
        // at recipe level, no ingredient pinpointed yet"), so the pill must
        // stay focusable + tappable in all cases.
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
            <span className="block font-semibold mb-0.5">Caused by</span>
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
              No specific ingredient identified — edit the recipe to flag one.
            </span>
          </>
        )}
      </span>
    </span>
  );
}
