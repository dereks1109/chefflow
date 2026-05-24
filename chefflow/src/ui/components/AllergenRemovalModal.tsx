import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { AllergenRemovalReason } from '../../core/types';

interface ReasonOption {
  value: AllergenRemovalReason;
  label: string;
}

const REASON_OPTIONS: ReasonOption[] = [
  { value: 'ingredient-changed', label: 'Ingredient changed to a non-allergenic version' },
  { value: 'recipe-changed', label: 'Recipe changed' },
  { value: 'mistakenly-added', label: 'Tag was accidentally or mistakenly added' },
  { value: 'other', label: 'Other (provide reason)' },
];

const REASON_LABEL: Record<AllergenRemovalReason, string> = REASON_OPTIONS.reduce(
  (acc, opt) => ({ ...acc, [opt.value]: opt.label }),
  {} as Record<AllergenRemovalReason, string>,
);

const COOLDOWN_SECONDS = 5;

interface Props {
  open: boolean;
  /** Display label for the allergen being removed (e.g. "Milk"). */
  allergenLabel: string;
  /** Snapshot of ingredient names currently flagged for this allergen. */
  ingredientsAtTime: string[];
  onCancel(): void;
  onConfirm(reasons: AllergenRemovalReason[], otherText?: string): void;
}

type Step = 'reason' | 'confirm';

/**
 * Safety-critical modal — fires before an allergen tag is stripped from a
 * recipe. Two sequential gates protect against accidental removal:
 *   STEP 1 (reason): pick at least one reason (multi-select; reasons can
 *     co-apply, e.g. ingredient-changed + mistakenly-added). "Other" needs
 *     explanatory text so the audit log isn't an unfalsifiable shrug.
 *   STEP 2 (confirm): 5-second cooldown — the Confirm button stays disabled
 *     with a visible countdown so the chef has time to read the consequence
 *     summary before committing.
 *
 * Cancel is always active. Back from step 2 returns to step 1 with reasons
 * preserved + cooldown reset (so re-entering doesn't auto-arm Confirm).
 */
export default function AllergenRemovalModal({
  open,
  allergenLabel,
  ingredientsAtTime,
  onCancel,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<Step>('reason');
  const [reasons, setReasons] = useState<AllergenRemovalReason[]>([]);
  const [otherText, setOtherText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep('reason');
    setReasons([]);
    setOtherText('');
    setSecondsLeft(COOLDOWN_SECONDS);
  }, [open]);

  // Cooldown ticker — runs only on step 2.
  useEffect(() => {
    if (!open || step !== 'confirm') return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [open, step, secondsLeft]);

  if (!open) return null;

  const otherChecked = reasons.includes('other');
  const otherTextOk = !otherChecked || otherText.trim().length > 0;
  const hasReason = reasons.length > 0;
  const canContinue = hasReason && otherTextOk;
  const cooldownDone = secondsLeft <= 0;

  function toggleReason(r: AllergenRemovalReason) {
    setReasons((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  }

  function handleContinue() {
    if (!canContinue) return;
    setStep('confirm');
    setSecondsLeft(COOLDOWN_SECONDS);
  }

  function handleBack() {
    setStep('reason');
    setSecondsLeft(COOLDOWN_SECONDS);
  }

  function handleConfirm() {
    if (!cooldownDone) return;
    onConfirm(reasons, otherChecked ? otherText.trim() : undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="allergen-removal-title"
      data-testid="allergen-removal-modal"
      data-step={step}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-kitchen-ink shadow-xl border border-slate-200 dark:border-slate-700">
        <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 id="allergen-removal-title" className="text-base font-semibold inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
            {step === 'reason'
              ? `Remove allergen "${allergenLabel}" — step 1 of 2`
              : `Are you sure? — step 2 of 2`}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {step === 'reason' && (
          <div className="px-4 py-3 space-y-3">
            <div className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 text-xs text-rose-900 dark:text-rose-200">
              <p className="font-medium">This is a safety-critical change.</p>
              <p className="mt-1">
                Allergen tags protect diners with food allergies. Removing a tag means this
                recipe will no longer be flagged for "{allergenLabel}". Pick at least one
                reason — the audit log records WHY this signal was stripped.
              </p>
            </div>

            {ingredientsAtTime.length > 0 && (
              <div className="text-xs">
                <p className="text-slate-500 mb-1">Currently triggered by:</p>
                <p className="text-slate-700 dark:text-slate-200">
                  {ingredientsAtTime.join(', ')}
                </p>
              </div>
            )}

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                Reason for removal (pick at least one):
              </legend>
              {REASON_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reasons.includes(opt.value)}
                    onChange={() => toggleReason(opt.value)}
                    data-testid={`allergen-reason-${opt.value}`}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
                  />
                  <span className="text-slate-700 dark:text-slate-200">{opt.label}</span>
                </label>
              ))}
            </fieldset>

            {otherChecked && (
              <label className="block text-xs">
                <span className="text-slate-700 dark:text-slate-200">
                  Please describe the reason (required):
                </span>
                <textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  rows={2}
                  data-testid="allergen-other-text"
                  className="input mt-1 resize-y text-xs"
                  placeholder="e.g. corrected after lab test confirmed no cross-contamination"
                />
              </label>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="px-4 py-3 space-y-3">
            <div className="rounded-md border border-rose-400 dark:border-rose-700 bg-rose-100 dark:bg-rose-900/30 p-3 text-xs text-rose-900 dark:text-rose-100">
              <p className="font-semibold">Final confirmation</p>
              <p className="mt-1">
                You're about to remove the "{allergenLabel}" allergen tag from this recipe.
                Once removed, diners and other chefs viewing this dish will no longer see
                a "{allergenLabel}" warning. The action is logged but the tag is not
                automatically restored.
              </p>
            </div>

            <div className="text-xs">
              <p className="text-slate-500 mb-1">Recorded reason{reasons.length === 1 ? '' : 's'}:</p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-200 space-y-0.5">
                {reasons.map((r) => (
                  <li key={r}>
                    {REASON_LABEL[r]}
                    {r === 'other' && otherText.trim() ? ` — ${otherText.trim()}` : ''}
                  </li>
                ))}
              </ul>
            </div>

            {ingredientsAtTime.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Ingredients at the time: {ingredientsAtTime.join(', ')}
              </p>
            )}
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          {step === 'reason' ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary text-sm"
                data-testid="allergen-removal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!canContinue}
                data-testid="allergen-removal-continue"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="btn-secondary text-sm"
                data-testid="allergen-removal-back"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary text-sm"
                data-testid="allergen-removal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!cooldownDone}
                data-testid="allergen-removal-confirm"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                {cooldownDone ? 'Confirm removal' : `Confirm removal (${secondsLeft})`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
