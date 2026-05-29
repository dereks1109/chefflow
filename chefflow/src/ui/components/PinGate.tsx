import { useState, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Lock, X } from 'lucide-react';
import { usePinStore } from '../../state/usePinStore';
import {
  requestPinRecovery,
  verifyPinRecovery,
  PinRecoveryError,
} from '../../core/pin/pinRecoveryClient';

// ---------------------------------------------------------------------------
// PinGate — wraps an editor page (RecipeEditor, EventEditor). When a PIN
// is set AND the chef hasn't already unlocked this session, blocks the
// children behind a numeric-PIN entry modal. Once unlocked, the gate is
// transparent for the rest of the browser session (refresh re-arms).
//
// "Forgot PIN" flow: chef clicks Forgot PIN? → worker emails a 6-digit
// code to their Clerk-primary email → chef enters it → worker verifies
// → SPA clears the local PIN. The worker never sees the PIN itself;
// the code is the proof-of-account-access. Server-side rate-limited
// (3 sends per hour per user) so a hijacked Clerk session can't spam
// the inbox.
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

type ForgotStep = 'send' | 'verify';

function PinGateModal() {
  const verifyPin = usePinStore((s) => s.verifyPin);
  const clearPin = usePinStore((s) => s.clearPin);
  const { user } = useUser();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'enter' | 'forgot'>('enter');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('send');
  const [code, setCode] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? '';

  async function handleVerify() {
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyPin(pin);
      if (!ok) {
        setError('Incorrect PIN. Try again, or use "Forgot PIN".');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode() {
    setForgotError(null);
    setForgotInfo(null);
    setBusy(true);
    try {
      const out = await requestPinRecovery();
      setForgotInfo(`Code sent to ${out.emailHint ?? primaryEmail}. Check your inbox + spam folder.`);
      setForgotStep('verify');
    } catch (err) {
      const msg = err instanceof PinRecoveryError
        ? err.message
        : 'Could not send code. Try again.';
      setForgotError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    setForgotError(null);
    setBusy(true);
    try {
      await verifyPinRecovery(code);
      // Burn the local PIN. The parent PinGate observes isPinSet=false
      // on next render and the modal unmounts.
      clearPin();
    } catch {
      setForgotError('Invalid or expired code. Try again or send a new one.');
    } finally {
      setBusy(false);
    }
  }

  function backToEnter() {
    setMode('enter');
    setForgotStep('send');
    setCode('');
    setForgotError(null);
    setForgotInfo(null);
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
                : forgotStep === 'send'
                  ? `We'll email a 6-digit recovery code to ${primaryEmail || 'your account email'}.`
                  : 'Enter the 6-digit code from the email. Clearing the PIN only affects the lock screen — your recipes, events, and notes stay intact.'}
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
        ) : forgotStep === 'send' ? (
          <>
            {forgotError && (
              <p role="alert" data-testid="pin-gate-forgot-error" className="mt-3 text-xs text-red-600 dark:text-red-400">
                {forgotError}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={backToEnter}
                className="text-xs text-slate-500 hover:text-accent hover:underline inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={busy || !primaryEmail}
                data-testid="pin-gate-forgot-send"
                className="btn-secondary text-sm disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send recovery code'}
              </button>
            </div>
          </>
        ) : (
          <>
            {forgotInfo && (
              <p data-testid="pin-gate-forgot-info" className="mt-3 text-xs text-slate-500">
                {forgotInfo}
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 6) void handleVerifyCode();
              }}
              placeholder="------"
              aria-label="6-digit recovery code"
              data-testid="pin-gate-forgot-code"
              className="mt-3 w-full text-center text-2xl tracking-[0.4em] font-mono rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 py-3"
            />
            {forgotError && (
              <p role="alert" data-testid="pin-gate-forgot-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {forgotError}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={backToEnter}
                className="text-xs text-slate-500 hover:text-accent hover:underline inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSendCode()}
                  disabled={busy}
                  data-testid="pin-gate-forgot-resend"
                  className="text-xs text-slate-500 hover:text-accent hover:underline disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerifyCode()}
                  disabled={code.length !== 6 || busy}
                  data-testid="pin-gate-forgot-confirm"
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Verify & clear PIN'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
