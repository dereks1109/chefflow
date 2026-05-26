import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const COOLDOWN_SECONDS = 5;

interface Props {
  open: boolean;
  /** Display label for the allergen about to be added (e.g. "Milk"). */
  allergenLabel: string;
  /** Optional context — name of the ingredient row the chef is tagging.
   *  When absent (recipe-level catch-all add via the chip input), the
   *  modal frames the add as a recipe-wide declaration. */
  ingredientName?: string;
  onCancel(): void;
  onConfirm(): void;
}

/**
 * Companion to AllergenRemovalModal — a lighter gate on the ADD path.
 * Adding allergens is the SAFER direction (you're flagging a potential
 * risk), so the modal skips reason-capture / audit logging. It keeps:
 *
 *   1. A 5-second cooldown on the Confirm button (mirrors removal modal)
 *      so a misclick on the dropdown can't silently add a false positive.
 *   2. A single confirmation checkbox so the chef pauses to read the
 *      "this ingredient contains X" framing before committing.
 *
 * Cancel returns to the prior state without any change.
 */
export default function AllergenAdditionModal({
  open,
  allergenLabel,
  ingredientName,
  onCancel,
  onConfirm,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);

  // Reset on every open so a previously-half-completed cooldown doesn't
  // leak into the next add.
  useEffect(() => {
    if (!open) return;
    setConfirmed(false);
    setSecondsLeft(COOLDOWN_SECONDS);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [open, secondsLeft]);

  if (!open) return null;

  const cooldownDone = secondsLeft <= 0;
  const canConfirm = confirmed && cooldownDone;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="allergen-add-heading"
      data-testid="allergen-add-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="allergen-add-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Add <span className="text-amber-700 dark:text-amber-300">{allergenLabel}</span> allergen flag
              {ingredientName ? <> to <span className="font-mono">{ingredientName}</span></> : null}?
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Allergen flags are safety-critical. Once added, this flag will
              be shown on the recipe card, in the workflow, and to anyone
              who copies this recipe. Only flag what you can confirm from
              the ingredient's supplier label.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="allergen-add-cancel-x"
            aria-label="Cancel"
            className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="allergen-add-confirm-check"
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
          />
          <span className="text-slate-700 dark:text-slate-200 leading-snug">
            Yes, I confirm this {ingredientName ? 'ingredient' : 'recipe'} contains{' '}
            <strong>{allergenLabel}</strong>.
          </span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="allergen-add-cancel"
            className="px-3 h-9 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            data-testid="allergen-add-confirm"
            className="px-3 h-9 rounded-md text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cooldownDone ? 'Confirm — add flag' : `Confirm (${secondsLeft})`}
          </button>
        </div>
      </div>
    </div>
  );
}
