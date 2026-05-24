import { AlertTriangle } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from '../../core/recipes/llm/allergens';
import type { AllergenTag } from '../../core/types';

// Allergens shown via `AllergenPill` are AI-assisted estimates. Anywhere the
// pill is rendered, pair it with `<FoodSafetyAdvisory />` so the user sees
// the verify-before-serving caveat. See plan Part 4.

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

export function AllergenPill({ tag }: { tag: AllergenTag }) {
  const label = ALLERGEN_LABEL[tag];
  const examples = ALLERGEN_EXAMPLES[tag];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-red-600
                 text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
      aria-label={`Allergen: ${label} (${examples})`}
      title={`${label} — ${examples}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
