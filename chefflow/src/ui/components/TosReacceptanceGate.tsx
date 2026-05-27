import { useState, type ReactNode } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CURRENT_TOS_VERSION,
  CURRENT_DISCLAIMER_VERSION,
} from '../../core/legal/versions';
import { completeOnboarding } from '../../core/onboarding/onboardingClient';

interface Props {
  children: ReactNode;
}

// Gate signed-in chefs behind a re-acceptance popup when the stored
// `tosVersion` / `disclaimerVersion` no longer matches the version that
// ships in the current build. Mounted alongside `OnboardingGate` in
// `App.tsx` — order matters: onboarding handles first-time users (no
// `tosAcceptedAt`), this gate handles version bumps for existing users.
//
// Why a popup instead of a passive Settings entry: a chef who signs in
// once a week could go for months without realising the Terms changed.
// A non-dismissible modal makes the bump unmissable. Standard SaaS
// pattern.
//
// Why NOT every login: once accepted, the gate stays silent until the
// next bump. Acceptance-fatigue is a real risk (chefs tick without
// reading); the SettingsPage status display covers the "I want to know
// when I accepted" case.

export default function TosReacceptanceGate({ children }: Props) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState(false);

  if (!isLoaded) return null;
  // Signed-out users: the gate is invisible. (SignInGate handles signed-out UX.)
  if (!user) return <>{children}</>;

  const meta = user.publicMetadata as {
    tosAcceptedAt?: unknown;
    tosVersion?: unknown;
    disclaimerVersion?: unknown;
  } | undefined;

  // First-time users (no tosAcceptedAt) go through OnboardingGate's flow
  // instead — don't double-prompt.
  const hasPriorAcceptance = typeof meta?.tosAcceptedAt === 'string' && meta.tosAcceptedAt.length > 0;
  const versionsMatch =
    meta?.tosVersion === CURRENT_TOS_VERSION &&
    meta?.disclaimerVersion === CURRENT_DISCLAIMER_VERSION;
  const needsReacceptance = hasPriorAcceptance && !versionsMatch && !localDone;

  if (!needsReacceptance) return <>{children}</>;

  async function handleConfirm() {
    if (!accepted) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeOnboarding({
        getToken,
        fields: {
          tosAcceptedAt: new Date().toISOString(),
          tosVersion: CURRENT_TOS_VERSION,
          disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
        },
      });
      setLocalDone(true);
      // Refresh Clerk's cached user so subsequent reads see the new
      // publicMetadata. Same pattern as OnboardingGate.
      void user?.reload?.().catch(() => { /* no-op */ });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-accept — please retry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {children}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tos-reaccept-heading"
        data-testid="tos-reaccept-modal"
        className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
      >
        <div className="w-full max-w-md rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-surface-1 p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <h2 id="tos-reaccept-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Our Terms have been updated
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                ChefFlow's Terms of Service or Disclaimer have changed since
                you last accepted. Please review and re-accept to keep using
                ChefFlow. We'll only ask again when we make another change.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Last accepted: v{String(meta?.tosVersion ?? '?')} (Terms)
                / v{String(meta?.disclaimerVersion ?? '?')} (Disclaimer).
                Current: v{CURRENT_TOS_VERSION} / v{CURRENT_DISCLAIMER_VERSION}.
              </p>
            </div>
            {/* No close X — the gate is non-dismissible. The chef must
                either re-accept or sign out. */}
            <span aria-hidden="true" className="p-1 text-slate-300 dark:text-slate-700">
              <X className="h-4 w-4" />
            </span>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              data-testid="tos-reaccept-check"
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
            />
            <span className="text-slate-700 dark:text-slate-200 leading-snug">
              I have read and accept the updated{' '}
              <Link to="/terms" target="_blank" className="text-accent hover:underline" data-testid="tos-reaccept-terms-link">
                Terms of Service
              </Link>
              {' '}and the{' '}
              <Link to="/disclaimer" target="_blank" className="text-accent hover:underline" data-testid="tos-reaccept-disclaimer-link">
                Disclaimer
              </Link>
              .
            </span>
          </label>

          {error && (
            <p role="alert" data-testid="tos-reaccept-error" className="mt-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!accepted || submitting}
              data-testid="tos-reaccept-confirm"
              className="px-3 h-9 rounded-md text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Re-accept'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
