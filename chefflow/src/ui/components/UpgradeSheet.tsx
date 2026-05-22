import { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useUpgradeSheetStore, type UpgradeReason } from '../../state/useUpgradeSheetStore';
import { TIER_LIMITS, TIER_PRICE_GBP } from '../../core/tier/limits';
import { createCheckoutUrl } from '../../core/tier/quotaClient';
import { useAuthGate } from '../../state/useAuthGate';

const HEADLINE: Record<UpgradeReason, string> = {
  recipe: "You've hit your daily recipe limit",
  event: "You've hit your daily event limit",
  llm: "You've used today's AI calls",
  general: 'Upgrade to ChefFlow Pro',
};

const BODY: Record<UpgradeReason, string> = {
  recipe: `Free accounts can create ${TIER_LIMITS.free.maxRecipesPerDay} recipes per day. Upgrade to Pro for unlimited recipes — the counter resets tomorrow either way.`,
  event: `Free accounts can create ${TIER_LIMITS.free.maxEventsPerDay} event per day. Upgrade to Pro for unlimited events.`,
  llm: `Free accounts get ${TIER_LIMITS.free.maxLlmCallsPerDay} AI calls per day. Pro accounts get ${TIER_LIMITS.pro.maxLlmCallsPerDay}/day.`,
  general: `Unlock unlimited recipe + event creation per day and ${TIER_LIMITS.pro.maxLlmCallsPerDay} AI calls per day. Cancel anytime from Settings.`,
};

export default function UpgradeSheet() {
  const open = useUpgradeSheetStore((s) => s.open);
  const reason = useUpgradeSheetStore((s) => s.reason);
  const close = useUpgradeSheetStore((s) => s.close);
  const requireAuth = useAuthGate();
  const [redirecting, setRedirecting] = useState<'month' | 'year' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRedirecting(null);
    setError(null);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function upgrade(interval: 'month' | 'year') {
    setRedirecting(interval);
    setError(null);
    try {
      const url = await createCheckoutUrl(interval);
      window.location.assign(url);
    } catch (err) {
      setRedirecting(null);
      setError(err instanceof Error ? err.message : 'Could not start checkout');
    }
  }

  if (!open || !reason) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-sheet-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id="upgrade-sheet-title" className="font-semibold inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              {HEADLINE[reason]}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{BODY[reason]}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700 shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <section className="px-5 py-4 space-y-4 text-sm">
          <div className="rounded-lg border border-accent/40 bg-accent/5 dark:bg-accent/10 px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">Pro</span>
              <span className="text-lg font-semibold">£{TIER_PRICE_GBP.pro.monthly}<span className="text-xs font-normal text-slate-500">/mo</span></span>
            </div>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                Unlimited recipe + event creation per day
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                {TIER_LIMITS.pro.maxLlmCallsPerDay} AI calls per day (vs {TIER_LIMITS.free.maxLlmCallsPerDay} on Free)
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                Annual: £{TIER_PRICE_GBP.pro.annual}/yr (save 25%)
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => requireAuth(() => void upgrade('month'))}
              disabled={redirecting !== null}
              data-testid="upgrade-sheet-cta-monthly"
              className="btn-primary disabled:opacity-60 disabled:cursor-wait"
            >
              {redirecting === 'month' ? 'Opening Stripe…' : `£${TIER_PRICE_GBP.pro.monthly}/mo`}
            </button>
            <button
              type="button"
              onClick={() => requireAuth(() => void upgrade('year'))}
              disabled={redirecting !== null}
              data-testid="upgrade-sheet-cta-annual"
              className="btn-secondary disabled:opacity-60 disabled:cursor-wait"
            >
              {redirecting === 'year' ? 'Opening Stripe…' : `£${TIER_PRICE_GBP.pro.annual}/yr`}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="button"
            onClick={close}
            className="w-full text-xs text-slate-500 hover:text-slate-700"
          >
            Maybe later
          </button>
        </section>
      </div>
    </div>
  );
}
