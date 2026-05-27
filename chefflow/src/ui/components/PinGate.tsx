import { useState, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Lock, X } from 'lucide-react';
import { usePinStore } from '../../state/usePinStore';

// ---------------------------------------------------------------------------
// PinGate — wraps an editor page (RecipeEditor, EventEditor). When a PIN
// is set AND the chef hasn't already unlocked this session, blocks the
// children behind a numeric-PIN entry modal. Once unlocked, the gate is
// transparent for the rest of the browser session (refresh re-arms).
//
// "Forgot PIN" flow: chef types their Clerk-primary email to confirm
// they're the account owner (they're already signed in — this is a
// "yes-this-is-me" gesture rather than a fresh credential proof) and
// the local PIN is wiped. Pragmatic compromise: no worker round-trip,
// no Resend email, ships in a day. Strong-credentials flow can be
// layered later if needed.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

export default function PinGate({ children }: Props) {
  const isPinSet = usePinStore((s) => s.isPinSet());
  const unlocked = usePinStore((s) => s.unlockedThisSession);

  if (!isPinSet || unlocked) return <>{children}</>;

  return <PinGateModal />;
}

function PinGateModal() {
  const verifyPin = usePinStore((s) => s.verifyPin);
  const clearPin = usePinStore((s) => s.clearPin);
  const { user } = useUser();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'enter' | 'forgot'>('enter');
  const [emailDraft, setEmailDraft] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);

  async function handleVerify() {
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyPin(pin);
      if (!ok) {
        setError('Incorrect PIN. Try again, or use "Forgot PIN".');
        setPin('');
      }
      // On success, the store flips unlockedThisSession=true and the
      // gate's parent re-renders past the modal automatically.
    } finally {
      setBusy(false);
    }
  }

  function handleForgotConfirm() {
    setForgotError(null);
    const primary = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? '';
    if (!primary) {
      setForgotError('No account email available — please sign out and back in.');
      return;
    }
    if (emailDraft.trim().toLowerCase() !== primary) {
      setForgotError('Email did not match the account on file.');
      return;
    }
    clearPin();
    // After clear, isPinSet flips to false → the parent PinGate renders
    // children directly. No state cleanup needed here — the modal
    // unmounts.
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-gate-heading"
      data-testid="pin-gate-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="pin-gate-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {mode === 'enter' ? 'Enter your PIN' : 'Forgot your PIN?'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'enter'
                ? 'This recipe / event is gated. You set a PIN in Settings — enter it to edit.'
                : 'To clear your PIN, confirm your account email below. The PIN will be removed from this device.'}
            </p>
          </div>
        </div>

        {mode === 'enter' ? (
          <>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pin.length >= 4) void handleVerify();
              }}
              placeholder="••••"
              aria-label="PIN"
              data-testid="pin-gate-input"
              className="mt-4 w-full text-center text-2xl tracking-[0.4em] font-mono rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 py-3"
            />
            {error && (
              <p role="alert" data-testid="pin-gate-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                data-testid="pin-gate-forgot"
                className="text-xs text-slate-500 hover:text-accent hover:underline"
              >
                Forgot PIN?
              </button>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={pin.length < 4 || busy}
                data-testid="pin-gate-submit"
                className="btn-primary text-sm disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Unlock'}
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              type="email"
              autoFocus
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder={user?.primaryEmailAddress?.emailAddress ?? 'you@example.com'}
              aria-label="Confirm account email"
              data-testid="pin-gate-forgot-email"
              className="mt-4 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm"
            />
            {forgotError && (
              <p role="alert" data-testid="pin-gate-forgot-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {forgotError}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { setMode('enter'); setForgotError(null); setEmailDraft(''); }}
                className="text-xs text-slate-500 hover:text-accent hover:underline inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={handleForgotConfirm}
                disabled={emailDraft.trim().length === 0}
                data-testid="pin-gate-forgot-confirm"
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Clear PIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
