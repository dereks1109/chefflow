import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import Button from './primitives/Button';
import { submitTakedownReport, type ReasonCode } from '../../core/community/takedownClient';

interface Props {
  communityRecipeId: string;
  onClose: () => void;
}

const REASONS: { value: ReasonCode; label: string }[] = [
  { value: 'copyright', label: 'Copyright infringement (this is my original work)' },
  { value: 'allergen_misinfo', label: 'Allergen information appears wrong or unsafe' },
  { value: 'spam', label: 'Spam, ad, or off-topic content' },
  { value: 'other', label: 'Other (describe below)' },
];

// Modal for filing a notice-and-takedown report against a community recipe.
// Posts to the worker, which writes to D1 takedown_reports for admin review.
// On success the dialog shows a confirmation; the recipe is NOT auto-
// unpublished — that happens after an admin actions the report.

export default function ReportRecipeDialog({ communityRecipeId, onClose }: Props) {
  const { getToken } = useAuth();
  const [reasonCode, setReasonCode] = useState<ReasonCode>('copyright');
  const [message, setMessage] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await submitTakedownReport({
        getToken,
        input: {
          communityRecipeId,
          reasonCode,
          message: message.trim() || undefined,
          reporterEmail: reporterEmail.trim() || undefined,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-heading"
      data-testid="report-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-6 shadow-2xl">
        {submitted ? (
          <>
            <h2 id="report-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Thanks — report received</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              We'll review your report and act within 7 days. If you provided
              an email address, you'll hear back at that address once the
              review is complete.
            </p>
            <div className="mt-6 flex items-center justify-end">
              <Button type="button" variant="primary" size="sm" onClick={onClose} data-testid="report-close">
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="report-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Report this recipe</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Use this form to flag copyrighted content, unsafe allergen claims,
              or other problems. An admin reviews every report.
            </p>

            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs text-slate-500">Reason</legend>
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="reasonCode"
                    value={r.value}
                    checked={reasonCode === r.value}
                    onChange={() => setReasonCode(r.value)}
                    data-testid={`report-reason-${r.value}`}
                    className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-accent focus:ring-accent"
                  />
                  <span className="text-slate-700 dark:text-slate-200">{r.label}</span>
                </label>
              ))}
            </fieldset>

            <label className="block mt-4">
              <span className="text-xs text-slate-500">Message (optional, up to 2000 chars)</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Add any detail that helps the review."
                data-testid="report-message"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            <label className="block mt-3">
              <span className="text-xs text-slate-500">Contact email (optional — we'll reply here)</span>
              <input
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="report-email"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            {error && (
              <p role="alert" data-testid="report-error" className="mt-3 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting} data-testid="report-cancel">
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => void handleSubmit()} disabled={submitting} data-testid="report-submit">
                {submitting ? 'Sending…' : 'Send report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
