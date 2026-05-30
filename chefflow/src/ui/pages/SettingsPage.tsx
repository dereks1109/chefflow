import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ChevronDown, LogIn, LogOut, Lock, Moon, Sparkles, Sun, UserRound, XCircle } from 'lucide-react';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { provisionDemos } from '../../core/demos/provisionClient';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { defaultAllergyKeywords } from '../../core/events/allergyKeywords';
import { requestPinRecovery, verifyPinRecovery, PinRecoveryError } from '../../core/pin/pinRecoveryClient';
import { useAllergyKeywordsStore } from '../../state/useAllergyKeywordsStore';
import { usePinStore } from '../../state/usePinStore';
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
import { useTheme } from '../theme/useTheme';
import AccountDataPanel from '../components/AccountDataPanel';
// Team management moved out of Settings in T5 — see /teams (TeamsList +
// TeamDetail pages). SettingsPage no longer imports from teamsClient.

// Settings tab IDs — mirrored to ?tab=… for deep-linking.
type SettingsTab = 'profile' | 'plan' | 'preferences' | 'data' | 'account';

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'plan', label: 'Plan & billing' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'data', label: 'Data & privacy' },
  { id: 'account', label: 'Account' },
];

function isSettingsTab(v: string | null): v is SettingsTab {
  return v === 'profile' || v === 'plan' || v === 'preferences' || v === 'data' || v === 'account';
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const tier = useTierStore((s) => s.tier);
  const { isSignedIn, user } = useUser();
  const clerk = useClerk();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  // Anonymous users see a sign-in prompt instead of the full settings —
  // every section here (profile, billing, usage) needs a Clerk user.
  if (!isSignedIn && !isE2E) {
    return (
      <section className="max-w-md mx-auto p-4 md:p-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-6 text-center">
          <Lock className="h-8 w-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold">Sign in to manage your account</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your profile, daily usage, and billing details live here once you're signed in.
          </p>
          <button
            type="button"
            onClick={() => clerk.openSignIn?.()}
            data-testid="settings-sign-in"
            className="mt-4 btn-primary inline-flex items-center gap-1.5"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in
          </button>
        </div>
      </section>
    );
  }
  const openUpgrade = useUpgradeSheetStore((s) => s.openWith);
  const [searchParams, setSearchParams] = useSearchParams();

  // Tabbed Settings (shipped 2026-05-29 from the UX audit). Previously
  // 12+ sections stacked vertically into a ~1700px page; tab routing
  // lets the chef jump straight to one concern without scrolling.
  // Tab state mirrored to ?tab=… so Settings pages are deep-linkable
  // from email links, bookmarks, etc.
  const rawTab = searchParams.get('tab');
  const activeTab: SettingsTab = isSettingsTab(rawTab) ? rawTab : 'profile';
  function setTab(next: SettingsTab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'profile') params.delete('tab'); // default; keep URL clean
      else params.set('tab', next);
      return params;
    });
  }
  const [portalRedirecting, setPortalRedirecting] = useState<'manage' | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelled, setCancelled] = useState<CancelSubscriptionResponse | null>(null);
  const [snapshot, setSnapshot] = useState<QuotaSnapshotResponse | null>(null);

  const displayName = useProfileStore((s) => s.displayName);
  const showNameOnCommunity = useProfileStore((s) => s.showNameOnCommunity);
  const setShowNameOnCommunity = useProfileStore((s) => s.setShowNameOnCommunity);
  const avatarDataUrl = useProfileStore((s) => s.avatarDataUrl);
  const setDisplayName = useProfileStore((s) => s.setDisplayName);
  const setAvatarDataUrl = useProfileStore((s) => s.setAvatarDataUrl);
  const homeAddress = useProfileStore((s) => s.homeAddress);
  const setHomeAddress = useProfileStore((s) => s.setHomeAddress);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [homeAddressDraft, setHomeAddressDraft] = useState(homeAddress);
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
  // ?upgraded=1. The Stripe webhook usually beats the user back to this
  // page, but the long tail goes >5s. We retry Clerk.user.reload() on an
  // exponential schedule covering ~p99 webhook latency. Each retry is
  // skipped if the tier has already flipped to pro.
  useEffect(() => {
    if (!justUpgraded || e2eMode) return;
    const clerk = (window as unknown as {
      Clerk?: { user?: { reload(): Promise<unknown> } };
    }).Clerk;
    const reload = () => clerk?.user?.reload?.().catch(() => { /* swallow */ });

    void reload();
    // Schedule cumulative-time retries: 1.5s, 3.5s, 7.5s. Each one no-ops
    // if useTierStore already reports pro (set by TierSync on prior reload).
    const RETRY_DELAYS_MS = [1500, 3500, 7500] as const;
    const timers = RETRY_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (useTierStore.getState().tier === 'free') void reload();
      }, delay),
    );
    // After 10s, strip the query param so a reload doesn't keep firing
    // this effect. The manual "Refresh status" button below picks up where
    // we leave off.
    const stripTimer = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('upgraded');
        return next;
      }, { replace: true });
    }, 10000);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(stripTimer);
    };
  }, [justUpgraded, setSearchParams, e2eMode]);

  async function manualRefreshTier() {
    const clerk = (window as unknown as {
      Clerk?: { user?: { reload(): Promise<unknown> } };
    }).Clerk;
    await clerk?.user?.reload?.().catch(() => undefined);
  }

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

      {/* Tab nav — horizontally scrollable on narrow viewports so all
          5 destinations stay reachable on phone widths. The active tab
          gets the orange accent treatment so it lines up visually with
          the rest of the app's primary nav. */}
      <nav
        role="tablist"
        aria-label="Settings sections"
        data-testid="settings-tabs"
        className="flex gap-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 border-b border-slate-200 dark:border-slate-700"
      >
        {SETTINGS_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-tabpanel-${t.id}`}
              onClick={() => setTab(t.id)}
              data-testid={`settings-tab-${t.id}`}
              className={[
                'px-3 py-2 text-sm font-medium whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {justUpgraded && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Welcome to Pro.</p>
            {tier === 'pro' || tier === 'business' ? (
              <p className="text-xs mt-0.5">Your plan is active. Daily limits have lifted.</p>
            ) : (
              <>
                <p className="text-xs mt-0.5">Refreshing your account — daily limits should lift in a few seconds.</p>
                <button
                  type="button"
                  onClick={() => void manualRefreshTier()}
                  data-testid="settings-manual-refresh"
                  className="mt-2 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-400 dark:border-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30"
                >
                  Still on Free? Refresh status
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
      <section
        id="settings-tabpanel-profile"
        role="tabpanel"
        aria-labelledby="settings-profile-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-profile-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Profile</h2>
        {/* Email row (2026-05-28) — surfaces which Clerk account is signed
            in. Especially useful when the chef has both a personal Gmail
            account and admin@chefflow.uk and wants to know which one is
            active. Read-only here; managed via Clerk's hosted profile. */}
        {user?.primaryEmailAddress?.emailAddress && (
          <p
            className="mt-2 text-xs text-slate-600 dark:text-slate-400"
            data-testid="settings-profile-email"
          >
            <span className="text-slate-500">Signed in as:</span>{' '}
            <span className="font-mono">{user.primaryEmailAddress.emailAddress}</span>
          </p>
        )}
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
            <label className="flex items-start gap-2 text-xs cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={showNameOnCommunity}
                onChange={(e) => setShowNameOnCommunity(e.target.checked)}
                data-testid="settings-show-name-on-community"
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
              />
              <span className="text-slate-700 dark:text-slate-200">
                Show my name on community recipes
                <span className="block text-slate-500">
                  When off, recipes you publish appear as "Anonymous chef".
                </span>
              </span>
            </label>
            <div className="mt-3" data-testid="settings-home-address-input">
              <span className="text-xs text-slate-500 block">
                Address of home/your restaurant (used to compute commute time on the workflow page)
              </span>
              <div className="mt-1">
                <LocationAutocomplete
                  value={homeAddressDraft}
                  onChange={(next) => {
                    setHomeAddressDraft(next);
                    // The autocomplete writes both on keystroke + on
                    // pick. Persist on every change so the workflow page
                    // sees the address immediately when the chef picks a
                    // suggestion (the input has no blur-after-pick).
                    setHomeAddress(next.trim());
                  }}
                  placeholder="Start typing an address — Google Places suggestions appear inline"
                  ariaLabel="Address of home or your restaurant"
                />
              </div>
              <span className="block mt-1 text-xs text-slate-500">
                Sent to Google Maps when you open an event's workflow. Leave
                empty to hide the commute banner.
              </span>
            </div>
          </div>
        </div>
      </section>
      )}

      {activeTab === 'plan' && (
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
                : tier === 'enterprise'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
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
          {tier === 'enterprise' && (
            <span className="text-sm text-slate-500">£{TIER_PRICE_GBP.enterprise.monthly}/mo or £{TIER_PRICE_GBP.enterprise.annual}/yr</span>
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
      )}

      {cancelOpen && (
        <CancelConfirmDialog
          onClose={() => setCancelOpen(false)}
          onConfirmed={(res) => {
            setCancelled(res);
            setCancelOpen(false);
          }}
        />
      )}

      {activeTab === 'preferences' && (
      <section
        aria-labelledby="settings-theme-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
      >
        <h2 id="settings-theme-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Theme</h2>
        {/* Segmented two-button control: chefs see both options at once and
            the active one is highlighted. Same useTheme contract — applies
            to <html class="dark"> + persists to localStorage. */}
        <div
          role="radiogroup"
          aria-label="Theme"
          className="mt-3 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-2 p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            onClick={() => setTheme('light')}
            data-testid="settings-theme-light"
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              theme === 'light'
                ? 'bg-accent text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100',
            ].join(' ')}
          >
            <Sun className="h-4 w-4" aria-hidden="true" />
            Light
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            onClick={() => setTheme('dark')}
            data-testid="settings-theme-dark"
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              theme === 'dark'
                ? 'bg-accent text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100',
            ].join(' ')}
          >
            <Moon className="h-4 w-4" aria-hidden="true" />
            Dark
          </button>
        </div>
      </section>
      )}

      {activeTab === 'preferences' && <RestoreDemosSection />}

      {activeTab === 'plan' && (
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
      )}

      {/* T5: Team management moved to /teams (top-nav). */}

      {activeTab === 'preferences' && <AllergyKeywordsSection />}

      {activeTab === 'preferences' && <PinSection />}

      {activeTab === 'data' && (isSignedIn || isE2E) && <LegalAcceptanceSection user={user ?? null} />}

      {/* Sign-out moved here from the top nav so it's not a one-tap-away
          accident risk in the chrome and so it sits naturally beside the
          rest of the account controls (display name + avatar). */}
      {activeTab === 'account' && !isE2E && isSignedIn && (
        <section
          aria-labelledby="settings-account-heading"
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
        >
          <h2 id="settings-account-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Account</h2>
          <p className="mt-2 text-xs text-slate-500">
            Signing out ends your session and returns you to the sign-in page. Your local recipes stay on this device.
          </p>
          <button
            type="button"
            onClick={() => void clerk.signOut?.({ redirectUrl: '/' })}
            data-testid="settings-sign-out"
            className="mt-3 inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </section>
      )}

      {activeTab === 'data' && (isSignedIn || isE2E) && <AccountDataPanel />}

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

interface UserLike {
  publicMetadata: Record<string, unknown>;
  reload?: () => Promise<unknown>;
}

// Re-runs the worker's demo-content seed (recipes + the Demo Event)
// even when the per-user KV marker says "already provisioned". Recovery
// for chefs who deleted demos and want them back. Hidden for guests
// (they already see demos via the public worker endpoint).
function RestoreDemosSection() {
  const { isSignedIn, getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) return null;

  async function handleRestore() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await provisionDemos({ getToken, force: true });
      // Two counters: fresh inserts (newly-seeded rows) + un-tombstoned
      // (previously chef-deleted rows the force pass revived). Both count
      // as "restored" from the chef's perspective.
      const recipesRestored = result.recipesInserted + (result.recipesUntombstoned ?? 0);
      setStatus(
        `Restored. ${result.eventsInserted} event${result.eventsInserted === 1 ? '' : 's'} + ${recipesRestored} recipe${recipesRestored === 1 ? '' : 's'}. Refresh /recipes and /events to see them.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-restore-demos-heading"
      data-testid="settings-restore-demos-section"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
    >
      <h2 id="settings-restore-demos-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Demo content
      </h2>
      <p className="mt-2 text-xs text-slate-500">
        Restore the 15 demo recipes and the Demo Event that ChefFlow seeds for
        every new chef. Safe to run more than once — your own recipes are
        untouched. The Demo Event is overwritten with its canonical version.
      </p>
      <button
        type="button"
        onClick={() => void handleRestore()}
        disabled={busy}
        data-testid="settings-restore-demos"
        className="mt-3 btn-secondary text-sm disabled:opacity-60"
      >
        {busy ? 'Restoring…' : 'Restore demo content'}
      </button>
      {status && (
        <p data-testid="settings-restore-demos-status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="settings-restore-demos-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

function LegalAcceptanceSection({ user }: { user: UserLike | null }) {
  const meta = (user?.publicMetadata ?? {}) as {
    tosAcceptedAt?: string;
    tosVersion?: string;
    disclaimerVersion?: string;
  };
  const accepted = !!meta.tosAcceptedAt;
  const acceptedDate = meta.tosAcceptedAt
    ? new Date(meta.tosAcceptedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  // 2026-05-28: re-acceptance flow moved to TosReacceptanceGate (a
  // login-time popup) — this section is now a passive status display
  // only. When versions mismatch the chef sees the gate popup BEFORE
  // they reach Settings, so the inline checkbox + button here would be
  // dead UI.

  return (
    <section
      aria-labelledby="settings-legal-heading"
      data-testid="settings-legal-section"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
    >
      <h2
        id="settings-legal-heading"
        className="text-sm font-semibold text-slate-500 uppercase tracking-wide"
      >
        Legal acceptances
      </h2>
      {accepted ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400" data-testid="settings-legal-accepted">
          You accepted Terms v{meta.tosVersion ?? '?'} and Disclaimer
          v{meta.disclaimerVersion ?? '?'} on {acceptedDate ?? '—'}.
        </p>
      ) : (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="settings-legal-missing">
          No acceptance record found on this account.
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        ChefFlow will ask you to re-accept when we update the Terms or
        Disclaimer — you don't need to do anything here.
      </p>

      <p className="mt-3 text-xs text-slate-500">
        <Link to="/terms" className="hover:underline">View current Terms</Link>
        {' · '}
        <Link to="/disclaimer" className="hover:underline">View current Disclaimer</Link>
      </p>
    </section>
  );
}

function AllergyKeywordsSection() {
  const extras = useAllergyKeywordsStore((s) => s.extras);
  const addExtra = useAllergyKeywordsStore((s) => s.add);
  const removeExtra = useAllergyKeywordsStore((s) => s.remove);
  const defaults = defaultAllergyKeywords();
  const [draft, setDraft] = useState('');

  function handleAdd() {
    const word = draft.trim();
    if (!word) return;
    addExtra(word);
    setDraft('');
  }

  return (
    <section
      aria-labelledby="settings-allergy-keywords-heading"
      data-testid="settings-allergy-keywords-section"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
    >
      <h2 id="settings-allergy-keywords-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Allergy and other keywords highlight
      </h2>
      <p className="mt-2 text-xs text-slate-500">
        ChefFlow highlights every match below in <strong>red</strong> wherever
        it appears in a customer's email or your event notes — so you don't
        miss an allergy, intolerance, dietary, or negation cue. Four
        categories ship by default:
      </p>
      <ul className="mt-2 ml-4 list-disc text-xs text-slate-500 space-y-0.5">
        <li><strong>Mandatory allergens</strong> — UK Top-14 + common specifics (celery, gluten, wheat, eggs, nuts, peanut, sesame, soy, sulphites…).</li>
        <li><strong>Dietary &amp; religious</strong> — halal, haram, kosher, vegan, vegetarian, gelatine…</li>
        <li><strong>Logic, Negation &amp; Requests</strong> — no, not, avoid, without, must, request, prefer, require, please, exclude…</li>
        <li><strong>Risk &amp; urgency</strong> — anaphylaxis, EpiPen, severe, intolerant, reaction, warning…</li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Defaults also cover common typos and misspellings (e.g. "peenut",
        "diary" for dairy, "celary") so customer fat-fingers don't slip
        through.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Everything is text-search only — never sent to AI. The default list
        is the safety baseline and can't be removed; add your own keywords
        below.
      </p>

      {/* Pill grids (defaults + your additions) collapsed by default —
          the defaults grid alone is ~80 pills tall. Heading +
          description + the add-keyword input stay visible above so
          the chef can scan + add without expanding. */}
      <details className="group mt-3 [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
        <summary
          className="cursor-pointer flex items-center justify-between gap-2 -m-1 p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          data-testid="settings-allergy-keywords-toggle"
        >
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Show keyword list
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span data-testid="settings-allergy-keywords-counts">
              {defaults.length} defaults · {extras.length} custom
            </span>
            <ChevronDown
              className="h-4 w-4 transition-transform duration-150 group-open:rotate-180"
              aria-hidden="true"
            />
          </div>
        </summary>

        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500 mb-1.5">Defaults (always on)</p>
          <div className="flex flex-wrap gap-1.5">
            {defaults.map((w) => (
              <span
                key={`d-${w}`}
                className="inline-flex items-center rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 text-red-800 dark:text-red-200 px-2 py-0.5 text-xs"
              >
                {w}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-500 mb-1.5">Your additions</p>
          {extras.length === 0 ? (
            <p className="text-xs text-slate-500 italic">None yet — add your own keywords below.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {extras.map((w) => (
                <span
                  key={`x-${w}`}
                  data-testid={`allergy-keyword-extra-${w}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-2 py-0.5 text-xs"
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => removeExtra(w)}
                    aria-label={`Remove keyword ${w}`}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                  >
                    <XCircle className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="e.g. celiac, kosher, halal…"
          className="input flex-1 text-sm"
          data-testid="settings-allergy-keyword-input"
          aria-label="Add allergy keyword"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={draft.trim().length === 0}
          data-testid="settings-allergy-keyword-add"
          className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50"
        >
          Add keyword
        </button>
      </div>
    </section>
  );
}

function PinSection() {
  const isPinSet = usePinStore((s) => s.isPinSet());
  const setPin = usePinStore((s) => s.setPin);
  const clearPin = usePinStore((s) => s.clearPin);
  const verifyPin = usePinStore((s) => s.verifyPin);
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'remove' | 'forgot-send' | 'forgot-verify'>('idle');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [forgotCode, setForgotCode] = useState('');
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  function reset() {
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setError(null);
    setForgotCode('');
    setForgotInfo(null);
    setForgotError(null);
    setMode('idle');
  }

  async function handleSendForgotCode() {
    setForgotError(null);
    setForgotInfo(null);
    setBusy(true);
    try {
      const out = await requestPinRecovery();
      setForgotInfo(`Code sent to ${out.emailHint ?? 'your account email'}. Check your inbox + spam folder.`);
      setMode('forgot-verify');
    } catch (err) {
      const msg = err instanceof PinRecoveryError ? err.message : 'Could not send code. Try again.';
      setForgotError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyForgotCode() {
    setForgotError(null);
    setBusy(true);
    try {
      await verifyPinRecovery(forgotCode);
      clearPin();
      setStatus('PIN cleared. The edit screen is no longer gated until you set a new PIN.');
      reset();
    } catch {
      setForgotError('Invalid or expired code. Try again or send a new one.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetOrChange() {
    setError(null);
    if (!/^\d{4,6}$/.test(newPin)) {
      setError('PIN must be 4–6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'change') {
        const ok = await verifyPin(oldPin);
        if (!ok) {
          setError('Current PIN is incorrect.');
          setBusy(false);
          return;
        }
      }
      await setPin(newPin);
      setStatus(mode === 'change' ? 'PIN changed.' : 'PIN set.');
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set PIN');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyPin(oldPin);
      if (!ok) {
        setError('Current PIN is incorrect.');
        setBusy(false);
        return;
      }
      clearPin();
      setStatus('PIN removed.');
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-pin-heading"
      data-testid="settings-pin-section"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
    >
      <h2 id="settings-pin-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Editor PIN (optional)
      </h2>
      <p className="mt-2 text-xs text-slate-500">
        Set a 4–6 digit PIN to require it before editing recipes or events.
        Recommended for shared kitchens — stops a passer-by from silently
        editing a recipe (or untagging an allergen) on an unattended
        device. You're asked once per browser session.
      </p>

      {status && (
        <p data-testid="settings-pin-status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          {status}
        </p>
      )}

      {mode === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isPinSet ? (
            <>
              <button
                type="button"
                onClick={() => { setStatus(null); setMode('change'); }}
                data-testid="settings-pin-change"
                className="btn-secondary text-sm"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => { setStatus(null); setMode('remove'); }}
                data-testid="settings-pin-remove"
                className="btn-secondary text-sm"
              >
                Remove PIN
              </button>
              <button
                type="button"
                onClick={() => { setStatus(null); setForgotError(null); setForgotInfo(null); setMode('forgot-send'); }}
                data-testid="settings-pin-forgot"
                className="text-xs text-slate-500 hover:text-accent hover:underline self-center ml-1"
                title="Recover by email — clears the PIN locally after you confirm a code sent to your account email."
              >
                Forgot PIN?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setStatus(null); setMode('set'); }}
              data-testid="settings-pin-set"
              className="btn-primary text-sm"
            >
              Set PIN
            </button>
          )}
        </div>
      )}

      {(mode === 'change' || mode === 'remove') && (
        <label className="block mt-3">
          <span className="text-xs font-medium text-slate-500">Current PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            data-testid="settings-pin-old-input"
            className="input mt-1 text-center text-lg font-mono tracking-[0.3em]"
          />
        </label>
      )}

      {(mode === 'set' || mode === 'change') && (
        <>
          <label className="block mt-3">
            <span className="text-xs font-medium text-slate-500">New PIN (4–6 digits)</span>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="settings-pin-new-input"
              className="input mt-1 text-center text-lg font-mono tracking-[0.3em]"
            />
          </label>
          <label className="block mt-3">
            <span className="text-xs font-medium text-slate-500">Confirm new PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="settings-pin-confirm-input"
              className="input mt-1 text-center text-lg font-mono tracking-[0.3em]"
            />
          </label>
        </>
      )}

      {error && (
        <p role="alert" data-testid="settings-pin-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {mode !== 'idle' && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={reset}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
          {mode === 'remove' ? (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy || oldPin.length < 4}
              data-testid="settings-pin-confirm-remove"
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Remove'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSetOrChange()}
              disabled={busy || newPin.length < 4 || confirmPin.length < 4 || (mode === 'change' && oldPin.length < 4)}
              data-testid="settings-pin-confirm-save"
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Save'}
            </button>
          )}
        </div>
      )}

      {(mode === 'forgot-send' || mode === 'forgot-verify') && (
        <div className="mt-3 space-y-2" data-testid="settings-pin-forgot-flow">
          <p className="text-xs text-slate-500">
            {mode === 'forgot-send'
              ? "We'll email a 6-digit recovery code to your account email. The PIN is cleared locally only — your recipes, events, and notes are not touched."
              : 'Enter the 6-digit code from the email.'}
          </p>
          {forgotInfo && (
            <p data-testid="settings-pin-forgot-info" className="text-xs text-slate-500">{forgotInfo}</p>
          )}
          {mode === 'forgot-verify' && (
            <input
              type="text"
              inputMode="numeric"
              value={forgotCode}
              onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && forgotCode.length === 6) void handleVerifyForgotCode();
              }}
              placeholder="------"
              aria-label="6-digit recovery code"
              data-testid="settings-pin-forgot-code"
              className="w-40 text-center text-xl tracking-[0.4em] font-mono rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 py-2"
            />
          )}
          {forgotError && (
            <p role="alert" data-testid="settings-pin-forgot-error" className="text-xs text-red-600 dark:text-red-400">
              {forgotError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            {mode === 'forgot-send' ? (
              <button
                type="button"
                onClick={() => void handleSendForgotCode()}
                disabled={busy}
                data-testid="settings-pin-forgot-send"
                className="btn-primary text-sm disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send recovery code'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSendForgotCode()}
                  disabled={busy}
                  data-testid="settings-pin-forgot-resend"
                  className="text-xs text-slate-500 hover:text-accent hover:underline disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerifyForgotCode()}
                  disabled={forgotCode.length !== 6 || busy}
                  data-testid="settings-pin-forgot-confirm"
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Verify & clear PIN'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

