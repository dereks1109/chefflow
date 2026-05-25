import { useEffect, useState } from 'react';
import { Check, Crown, Sparkles, X } from 'lucide-react';
import { useUpgradeSheetStore, type UpgradeReason } from '../../state/useUpgradeSheetStore';
import { TIER_LIMITS, TIER_PRICE_GBP } from '../../core/tier/limits';
import { createCheckoutUrl } from '../../core/tier/quotaClient';
import { useAuthGate } from '../../state/useAuthGate';

const HEADLINE: Record<UpgradeReason, string> = {
  recipe: "You've hit your daily recipe limit",
  event: "You've hit your daily event limit",
  llm: "You've used today's AI calls",
  general: 'Choose a plan',
};

const BODY: Record<UpgradeReason, string> = {
  recipe: `Free accounts can create ${TIER_LIMITS.free.maxRecipesPerDay} recipes per day. Pro is unlimited; Enterprise lifts every cap.`,
  event: `Free accounts can create ${TIER_LIMITS.free.maxEventsPerDay} event per day. Pro is unlimited; Enterprise lifts every cap.`,
  llm: `Free gets ${TIER_LIMITS.free.maxLlmCallsPerDay} AI calls/day. Pro: ${TIER_LIMITS.pro.maxLlmCallsPerDay}/day. Enterprise: unlimited.`,
  general: 'Cancel anytime from Settings. Existing recipes never count against the daily caps.',
};

type Interval = 'month' | 'year';
type PaidTier = 'pro' | 'enterprise';

interface Redirect {
  tier: PaidTier;
  interval: Interval;
}

export default function UpgradeSheet() {
  const open = useUpgradeSheetStore((s) => s.open);
  const reason = useUpgradeSheetStore((s) => s.reason);
  const close = useUpgradeSheetStore((s) => s.close);
  const requireAuth = useAuthGate();
  const [redirecting, setRedirecting] = useState<Redirect | null>(null);
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

  async function upgrade(tier: PaidTier, interval: Interval) {
    setRedirecting({ tier, interval });
    setError(null);
    try {
      const url = await createCheckoutUrl(interval, tier);
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
        className="relative w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
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

        <section className="px-5 py-4 grid gap-3 sm:grid-cols-2 text-sm">
          {/* Pro — private chefs + small bistros. */}
          <article className="rounded-lg border border-accent/40 bg-accent/5 dark:bg-accent/10 px-4 py-3 flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                Pro
              </span>
              <span className="text-lg font-semibold">
                £{TIER_PRICE_GBP.pro.monthly}
                <span className="text-xs font-normal text-slate-500">/mo</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Private chefs · small bistros · supper clubs</p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 flex-1">
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                Unlimited recipes + events per day
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                {TIER_LIMITS.pro.maxLlmCallsPerDay} AI calls per day
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                Cross-device sync + audit history
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">Annual: £{TIER_PRICE_GBP.pro.annual}/yr (save 25%)</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => requireAuth(() => void upgrade('pro', 'month'))}
                disabled={redirecting !== null}
                data-testid="upgrade-sheet-cta-pro-monthly"
                className="btn-primary disabled:opacity-60 disabled:cursor-wait"
              >
                {redirecting?.tier === 'pro' && redirecting.interval === 'month' ? 'Opening…' : `£${TIER_PRICE_GBP.pro.monthly}/mo`}
              </button>
              <button
                type="button"
                onClick={() => requireAuth(() => void upgrade('pro', 'year'))}
                disabled={redirecting !== null}
                data-testid="upgrade-sheet-cta-pro-annual"
                className="btn-secondary disabled:opacity-60 disabled:cursor-wait"
              >
                {redirecting?.tier === 'pro' && redirecting.interval === 'year' ? 'Opening…' : `£${TIER_PRICE_GBP.pro.annual}/yr`}
              </button>
            </div>
          </article>

          {/* Enterprise — hotels + large banquet restaurants. */}
          <article className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-surface-2 px-4 py-3 flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold inline-flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Enterprise
              </span>
              <span className="text-lg font-semibold">
                £{TIER_PRICE_GBP.enterprise.monthly}
                <span className="text-xs font-normal text-slate-500">/mo</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Hotels · large banquet restaurants · catering teams</p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 flex-1">
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" aria-hidden="true" />
                Everything in Pro, plus:
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" aria-hidden="true" />
                Unlimited AI calls — no daily cap
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" aria-hidden="true" />
                Up to {TIER_LIMITS.enterprise.maxSeats} chef seats
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" aria-hidden="true" />
                Priority email support
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">Annual: £{TIER_PRICE_GBP.enterprise.annual}/yr (save 25%)</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => requireAuth(() => void upgrade('enterprise', 'month'))}
                disabled={redirecting !== null}
                data-testid="upgrade-sheet-cta-enterprise-monthly"
                className="inline-flex items-center justify-center px-3 h-10 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 disabled:cursor-wait"
              >
                {redirecting?.tier === 'enterprise' && redirecting.interval === 'month' ? 'Opening…' : `£${TIER_PRICE_GBP.enterprise.monthly}/mo`}
              </button>
              <button
                type="button"
                onClick={() => requireAuth(() => void upgrade('enterprise', 'year'))}
                disabled={redirecting !== null}
                data-testid="upgrade-sheet-cta-enterprise-annual"
                className="btn-secondary disabled:opacity-60 disabled:cursor-wait"
              >
                {redirecting?.tier === 'enterprise' && redirecting.interval === 'year' ? 'Opening…' : `£${TIER_PRICE_GBP.enterprise.annual}/yr`}
              </button>
            </div>
          </article>
        </section>

        {error && (
          <p role="alert" className="mx-5 mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <footer className="px-5 pb-4">
          <button
            type="button"
            onClick={close}
            className="w-full text-xs text-slate-500 hover:text-slate-700"
          >
            Maybe later
          </button>
        </footer>
      </div>
    </div>
  );
}
