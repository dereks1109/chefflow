import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './primitives/Button';

interface Props {
  allergens: string[];
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

// Fired before a recipe is published to the community library. Surfaces
// the detected allergens, makes the user attest they verified them
// against supplier labels, and only then runs the publish. The
// attestation itself is the value — the legal posture is that the chef,
// not ChefFlow, is the food business operator under FIR 2014.

export default function AllergenAttestationModal({ allergens, onConfirm, onCancel, submitting }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attestation-heading"
      data-testid="allergen-attestation-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-6 shadow-2xl">
        <h2 id="attestation-heading" className="text-lg font-semibold inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          Confirm allergen accuracy
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          Before this recipe is published to the community, please confirm you
          have verified its allergen tags against your actual supplier labels.
          ChefFlow's allergen detection is best-effort and not a certified
          analysis.
        </p>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detected allergens</p>
          {allergens.length === 0 ? (
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              None detected. You're still responsible for confirming nothing
              was missed.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="attestation-allergen-list">
              {allergens.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="mt-4 flex items-start gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="allergen-attestation-checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
          />
          <span className="text-slate-700 dark:text-slate-200">
            I have verified these allergens against my supplier labels. I
            understand ChefFlow's tagging is best-effort and that I, as the
            food business operator, remain responsible under the Food
            Information Regulations 2014.
          </span>
        </label>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
            data-testid="allergen-attestation-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void onConfirm()}
            disabled={submitting || !confirmed}
            data-testid="allergen-attestation-confirm"
          >
            {submitting ? 'Publishing…' : 'Publish to community'}
          </Button>
        </div>
      </div>
    </div>
  );
}
