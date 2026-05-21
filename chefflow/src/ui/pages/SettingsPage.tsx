import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Sparkles, UserRound, XCircle } from 'lucide-react';
import { useTierStore } from '../../state/useTierStore';
import { TIER_LABEL, TIER_LIMITS, TIER_PRICE_GBP } from '../../core/tier/limits';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { useProfileStore } from '../../state/useProfileStore';
import {
  cancelOwnSubscription,
  createPortalUrl,
  getQuotaSnapshot,
  type CancelSubscriptionResponse,
  type QuotaSnapshotResponse,
} from '../../core/tier/quotaClient';
import { downscaleToDataUrl } from '../../core/util/image';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../theme/useTheme';

export default function SettingsPage() {
  const { theme } = useTheme();
  const tier = useTierStore((s) => s.tier);
  const openUpgrade = useUpgradeSheetStore((s) => s.openWith);
  const [searchParams, setSearchParams] = useSearchParams();
  const [portalRedirecting, setPortalRedirecting] = useState<'manage' | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelled, setCancelled] = useState<CancelSubscriptionResponse | null>(null);
  const [snapshot, setSnapshot] = useState<QuotaSnapshotResponse | null>(null);

  const displayName = useProfileStore((s) => s.displayName);
  const avatarDataUrl = useProfileStore((s) => s.avatarDataUrl);
  const setDisplayName = useProfileStore((s) => s.setDisplayName);
  const setAvatarDataUrl = useProfileStore((s) => s.setAvatarDataUrl);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await downscaleToDataUrl(file, 512);
      setAvatarDataUrl(dataUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not process image');
    }
  }

  const justUpgraded = searchParams.get('upgraded') === '1';
  const e2eMode = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';

  // After a successful Checkout, the success_url drops us here with
  // ?upgraded=1. Force Clerk to refetch publicMetadata so the tier flips
  // without a full page reload, then strip the query param.
  useEffect(() => {
    if (!justUpgraded || e2eMode) return;
    const clerk = (window as unknown as {
      Clerk?: { user?: { reload(): Promise<unknown> } };
    }).Clerk;
    void clerk?.user?.reload?.();
    const timer = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('upgraded');
        return next;
      }, { replace: true });
    }, 8000);
    return () => clearTimeout(timer);
  }, [justUpgraded, setSearchParams, e2eMode]);

  // Load today's usage snapshot.
  useEffect(() => {
    if (e2eMode) return;
    void getQuotaSnapshot().then(setSnapshot).catch(() => setSnapshot(null));
  }, [tier, e2eMode]);

  async function openPortal() {
    setPortalRedirecting('manage');
    setPortalError(null);
    try {
      const url = await createPortalUrl();
      window.location.assign(url);
    } catch (err) {
      setPortalRedirecting(null);
      setPortalError(err instanceof Error ? err.message : 'Could not open billing portal');
    }
  }

  return (
    <section className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your plan and see today's usage.</p>
      </header>

      {justUpgraded && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Welcome to Pro.</p>
            <p className="text-xs mt-0.5">Refreshing your account — daily limits should lift in a few seconds.</p>
          </div>
        </div>
      )}

      <section
        aria-labelledby="settings-profile-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-profile-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Profile</h2>
        <div className="mt-3 flex items-start gap-4">
          <div className="shrink-0">
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt="Profile avatar"
                data-testid="settings-profile-avatar-img"
                className="h-16 w-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div
                aria-label="No profile photo"
                className="h-16 w-16 rounded-full flex items-center justify-center bg-slate-100 dark:bg-surface-2 text-slate-400 border border-slate-200 dark:border-slate-700"
              >
                {displayName.trim().length > 0 ? (
                  <span className="text-lg font-semibold text-slate-500 dark:text-slate-300">
                    {displayName.trim().charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserRound className="h-7 w-7" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleAvatarPick(e)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="settings-profile-photo-pick"
                className="btn-secondary text-sm"
              >
                Change photo
              </button>
              {avatarDataUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarDataUrl(null)}
                  data-testid="settings-profile-photo-clear"
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Remove photo
                </button>
              )}
            </div>
            {avatarError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">{avatarError}</p>
            )}
            <label className="block">
              <span className="text-xs text-slate-500">Display name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={(e) => setDisplayName(e.target.value.trim())}
                placeholder="Your name"
                data-testid="settings-profile-name-input"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="settings-plan-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-plan-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Current plan</h2>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={[
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold',
              tier === 'pro'
                ? 'bg-accent/15 text-accent'
                : tier === 'business'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            ].join(' ')}
            data-testid="settings-tier-chip"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {TIER_LABEL[tier]}
          </span>
          {tier === 'free' && (
            <span className="text-sm text-slate-500">£0/mo</span>
          )}
          {tier === 'pro' && (
            <span className="text-sm text-slate-500">£{TIER_PRICE_GBP.pro.monthly}/mo or £{TIER_PRICE_GBP.pro.annual}/yr</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tier === 'free' && (
            <button
              type="button"
              onClick={() => openUpgrade('recipe')}
              data-testid="settings-upgrade-cta"
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Upgrade to Pro
            </button>
          )}
          {(tier === 'pro' || tier === 'business') && (
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={portalRedirecting !== null}
              data-testid="settings-portal-cta"
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              {portalRedirecting === 'manage' ? 'Opening Stripe…' : 'Manage billing'}
            </button>
          )}
        </div>

        {(tier === 'pro' || tier === 'business') && !cancelled && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              disabled={portalRedirecting !== null}
              data-testid="settings-cancel-cta"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel subscription
            </button>
          </div>
        )}

        {cancelled && (
          <p
            role="status"
            data-testid="settings-cancel-confirmed"
            className="mt-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            Subscription will end on {formatPeriodEnd(cancelled.periodEndUnix)}. You'll keep Pro until then.
          </p>
        )}

        {portalError && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{portalError}</p>
        )}
      </section>

      {cancelOpen && (
        <CancelConfirmDialog
          onClose={() => setCancelOpen(false)}
          onConfirmed={(res) => {
            setCancelled(res);
            setCancelOpen(false);
          }}
        />
      )}

      <section
        aria-labelledby="settings-theme-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-theme-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Theme</h2>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700 dark:text-slate-200">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
          <ThemeToggle />
        </div>
      </section>

      <section
        aria-labelledby="settings-usage-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-usage-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Today's usage</h2>
        {snapshot ? (
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UsageRow label="Recipes" count={snapshot.quotas.recipe.count} limit={snapshot.quotas.recipe.limit} unlimited={snapshot.quotas.recipe.remaining === null} />
            <UsageRow label="Events" count={snapshot.quotas.event.count} limit={snapshot.quotas.event.limit} unlimited={snapshot.quotas.event.remaining === null} />
            <UsageRow label="AI calls" count={snapshot.quotas.llm.count} limit={snapshot.quotas.llm.limit} unlimited={snapshot.quotas.llm.remaining === null} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {e2eMode ? 'Usage hidden in test mode.' : 'Loading…'}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Free accounts reset at UTC midnight. Limits: {TIER_LIMITS.free.maxRecipesPerDay} recipes / {TIER_LIMITS.free.maxEventsPerDay} event / {TIER_LIMITS.free.maxLlmCallsPerDay} AI calls per day.
        </p>
      </section>

      <p className="text-xs text-slate-500">
        Need help? <Link to="/disclaimer" className="text-accent hover:underline">Disclaimer</Link>
        {' · '}<Link to="/privacy" className="text-accent hover:underline">Privacy</Link>
      </p>
    </section>
  );
}

function UsageRow({ label, count, limit, unlimited }: { label: string; count: number; limit: number; unlimited: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {unlimited ? 'Unlimited' : `${count} / ${limit}`}
      </dd>
    </div>
  );
}

interface CancelConfirmDialogProps {
  onClose: () => void;
  onConfirmed: (res: CancelSubscriptionResponse) => void;
}

function CancelConfirmDialog({ onClose, onConfirmed }: CancelConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await cancelOwnSubscription();
      onConfirmed(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel subscription');
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 id="cancel-dialog-title" className="font-semibold inline-flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
            Cancel ChefFlow Pro?
          </h2>
        </header>
        <section className="px-5 py-4 space-y-3 text-sm">
          <p className="text-slate-700 dark:text-slate-200">
            Your subscription will be set to end at the close of your current billing period.
            You'll keep Pro features until then.
          </p>
          <p className="text-xs text-slate-500">
            You can resubscribe any time. No refunds for the current period.
          </p>
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-secondary flex-1 disabled:opacity-60"
              data-testid="cancel-dialog-keep"
            >
              Keep subscription
            </button>
            <button
              type="button"
              onClick={() => void confirmCancel()}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait"
              data-testid="cancel-dialog-confirm"
            >
              {busy ? 'Cancelling…' : 'Confirm cancel'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatPeriodEnd(unix: number): string {
  if (!unix) return 'your next billing date';
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
