import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  open: boolean;
  onCancel(): void;
  /** Fires after the chef ticks the box and clicks Save. The parent is
   *  responsible for persisting the recipe AND setting the session flag
   *  in `useSessionAttestationStore` so subsequent saves this session
   *  skip the modal. */
  onConfirm(): void;
}

/**
 * Lightweight session-scope attestation that fires on the FIRST recipe
 * save in a browser session. Strictly weaker than the publish-time
 * `AllergenAttestationModal` (no per-tag enumeration; no audit log row),
 * but stronger than nothing — it makes sure every chef sees the
 * "ChefFlow is not a hygiene-certification service" framing at least
 * once per session, with a documentable click. Refresh / sign-out re-arms
 * the gate.
 */
export default function RecipeSaveAttestationModal({ open, onCancel, onConfirm }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) setConfirmed(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-save-attest-heading"
      data-testid="recipe-save-attest-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="recipe-save-attest-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Save this recipe
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              ChefFlow is a kitchen-productivity tool — not a
              hygiene-certification or food-safety service. You remain
              responsible for verifying allergens, ingredient quantities,
              and food-safety procedures before serving anything based on
              this recipe.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              See the{' '}
              <Link to="/disclaimer" target="_blank" className="text-accent hover:underline">
                Disclaimer
              </Link>
              {' '}for the full framing. This acknowledgement is recorded
              for this browser session — you won't be asked again until
              you refresh or sign out.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="recipe-save-attest-cancel-x"
            aria-label="Cancel save"
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
            data-testid="recipe-save-attest-check"
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
          />
          <span className="text-slate-700 dark:text-slate-200 leading-snug">
            I understand ChefFlow is not a hygiene-certification or
            food-safety service. I remain responsible for the final
            allergen and safety verification of this recipe.
          </span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="recipe-save-attest-cancel"
            className="px-3 h-9 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed}
            data-testid="recipe-save-attest-confirm"
            className="px-3 h-9 rounded-md text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}
