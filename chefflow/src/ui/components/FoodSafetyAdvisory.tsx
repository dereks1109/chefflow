import { Info } from 'lucide-react';

// Single source of truth for the "this output is AI-assisted, verify before
// serving" disclaimer. Mounted alongside any UI surface that presents
// LLM-derived food-safety information (allergens, menu-suitability verdicts,
// dietary analysis). See plan: /root/.claude/plans/1-make-every-user-serene-leaf.md
// Part 4 — food-safety legal risk addendum.

interface Props {
  /** Override the default copy when the surrounding context already names
   *  the relevant area (e.g. "menu-suitability checks" vs "allergens"). */
  message?: string;
  /** Visual density — `compact` for inline-with-pills, `block` for standalone. */
  variant?: 'compact' | 'block';
}

const DEFAULT_MESSAGE =
  'AI-assisted estimate — verify before serving. The chef remains responsible for allergen and food-safety checks.';

export default function FoodSafetyAdvisory({
  message = DEFAULT_MESSAGE,
  variant = 'compact',
}: Props) {
  if (variant === 'block') {
    return (
      <div
        role="note"
        className="rounded-md border border-amber-300 dark:border-amber-800/60
                   bg-amber-50/70 dark:bg-amber-900/15 px-3 py-2 text-xs
                   text-amber-900 dark:text-amber-200 inline-flex items-start gap-2"
      >
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }
  return (
    <p
      role="note"
      className="mt-1 text-xs italic text-slate-500 dark:text-slate-400 inline-flex items-center gap-1"
    >
      <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
