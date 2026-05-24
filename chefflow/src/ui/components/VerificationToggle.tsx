import { CheckCircle2, ShieldQuestion } from 'lucide-react';

// Small audit-trail control. Pairs the verification state (verifiedAt /
// verifiedBy on Recipe or KitchenEvent) with a chef-driven toggle. See
// plan Part 4 — gives the chef a paper trail showing they reviewed
// allergen and dietary information before service.

interface Props {
  verifiedAt?: number;
  verifiedBy?: string;
  /** Name to record when the chef clicks Verify (typically displayName
   *  from UserPrefs, falling back to the Clerk name). */
  chefName: string;
  onChange: (next: { verifiedAt?: number; verifiedBy?: string }) => void;
  /** Optional context label for the confirm dialog — "this recipe" /
   *  "this menu". Defaults to "this entry". */
  label?: string;
}

export default function VerificationToggle({
  verifiedAt,
  verifiedBy,
  chefName,
  onChange,
  label = 'this entry',
}: Props) {
  const verified = typeof verifiedAt === 'number';

  function handleVerify() {
    if (
      !window.confirm(
        `Confirm you have personally reviewed ${label} — including allergen flags, dietary requirements, and any food-safety steps — before this is served.`,
      )
    ) {
      return;
    }
    onChange({ verifiedAt: Date.now(), verifiedBy: chefName || 'unknown' });
  }

  function handleClear() {
    onChange({ verifiedAt: undefined, verifiedBy: undefined });
  }

  if (verified) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-300
                   dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-900/15
                   px-3 py-1 text-xs text-emerald-900 dark:text-emerald-200"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Verified by <strong>{verifiedBy || 'a chef'}</strong>{' '}
          {new Date(verifiedAt!).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="ml-1 underline decoration-dotted hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
          aria-label="Clear verification"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleVerify}
      className="inline-flex items-center gap-2 rounded-full border border-slate-300
                 dark:border-slate-600 bg-white dark:bg-surface-2
                 px-3 py-1 text-xs text-slate-700 dark:text-slate-300
                 hover:border-emerald-500 hover:text-emerald-700
                 dark:hover:text-emerald-300
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      title="Mark this as personally reviewed for allergens, dietary requirements, and food safety."
    >
      <ShieldQuestion className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Mark as verified
    </button>
  );
}
