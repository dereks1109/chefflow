import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, RefreshCw, AlertCircle, X, Activity, Users, PoundSterling, BadgeCheck, MessageSquare, AlertTriangle } from 'lucide-react';
import { useAdminStore } from '../../state/useAdminStore';
import {
  listMembers,
  getMetrics,
  getActivity,
  listContactSubmissions,
  listAllergenAudits,
  listD1AllergenAudits,
  grantPro,
  revokePro,
  cancelSubscription,
  refundLatestCharge,
  AdminClientError,
  type MemberRow,
  type MetricsResult,
  type ActivityEvent,
  type ContactSubmissionRow,
  type AllergenAuditRow,
  type D1AllergenAuditRow,
} from '../../core/admin/adminClient';
import { TIER_LABEL } from '../../core/tier/limits';

export default function AdminDashboard() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const e2eMode = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';

  if (!isAdmin && !e2eMode) {
    return (
      <section className="max-w-md mx-auto p-6 mt-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink text-center">
        <Shield className="h-8 w-8 text-slate-400 mx-auto" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Admin only</h1>
        <p className="mt-2 text-sm text-slate-500">
          You don't have access to this page. Add <code>role: admin</code> to your Clerk
          publicMetadata in the Clerk Dashboard if you should.
        </p>
      </section>
    );
  }

  return <AdminDashboardBody />;
}

function AdminDashboardBody() {
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactSubmissionRow[]>([]);
  const [allergenAudits, setAllergenAudits] = useState<AllergenAuditRow[]>([]);
  const [d1Audits, setD1Audits] = useState<D1AllergenAuditRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [selected, setSelected] = useState<MemberRow | null>(null);

  // Refresh handler — called from the Refresh button click. May setState
  // synchronously (it's an event handler, not an effect).
  const loadFirstPage = useCallback(async () => {
    setLoadError(null);
    setLoadingPage(true);
    try {
      const [m, msPage, a, cs, aa, d1] = await Promise.all([
        getMetrics(),
        listMembers(0, 50),
        getActivity(),
        listContactSubmissions(),
        listAllergenAudits(),
        listD1AllergenAudits(),
      ]);
      setMetrics(m);
      setMembers(msPage.members);
      setNextOffset(msPage.nextOffset);
      setActivity(a.events);
      setContactSubmissions(cs.items);
      setAllergenAudits(aa.items);
      setD1Audits(d1.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoadingPage(false);
    }
  }, []);

  // Initial load — written as a promise chain so no setState happens
  // synchronously inside the effect body (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMetrics(),
      listMembers(0, 50),
      getActivity(),
      listContactSubmissions(),
      listAllergenAudits(),
      listD1AllergenAudits(),
    ])
      .then(([m, msPage, a, cs, aa, d1]) => {
        if (cancelled) return;
        setMetrics(m);
        setMembers(msPage.members);
        setNextOffset(msPage.nextOffset);
        setActivity(a.events);
        setContactSubmissions(cs.items);
        setAllergenAudits(aa.items);
        setD1Audits(d1.items);
        setLoadingPage(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load admin data');
        setLoadingPage(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function loadMore() {
    if (nextOffset === null) return;
    setLoadingPage(true);
    try {
      const page = await listMembers(nextOffset, 50);
      setMembers((prev) => [...prev, ...page.members]);
      setNextOffset(page.nextOffset);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingPage(false);
    }
  }

  function updateMember(userId: string, patch: Partial<MemberRow>) {
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...patch } : m)));
    setSelected((s) => (s && s.userId === userId ? { ...s, ...patch } : s));
  }

  return (
    <section className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" aria-hidden="true" />
            Membership dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live view of every ChefFlow user, their plan, and recent billing activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadFirstPage()}
          disabled={loadingPage}
          className="btn-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-60"
          data-testid="admin-refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loadingPage ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      <MetricsCards metrics={metrics} />

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <MembersTable
          members={members}
          onRowClick={setSelected}
          onLoadMore={loadMore}
          hasMore={nextOffset !== null}
          loadingMore={loadingPage}
        />
        <ActivityFeed events={activity} />
      </div>

      <ContactSubmissionsPanel submissions={contactSubmissions} />

      <AllergenAuditsPanel audits={allergenAudits} />

      <D1AllergenAuditsPanel audits={d1Audits} />

      {selected && (
        <MemberDrawer
          member={selected}
          onClose={() => setSelected(null)}
          onChange={(patch) => updateMember(selected.userId, patch)}
        />
      )}
    </section>
  );
}

function MetricsCards({ metrics }: { metrics: MetricsResult | null }) {
  const cards = useMemo(() => {
    if (!metrics) return null;
    return [
      { label: 'Total members', value: metrics.totalMembers.toLocaleString(), icon: Users },
      { label: 'Free', value: metrics.byTier.free.toLocaleString(), icon: BadgeCheck },
      { label: 'Pro', value: metrics.byTier.pro.toLocaleString(), icon: BadgeCheck, accent: true },
      { label: 'MRR (£/mo)', value: formatPence(metrics.mrrPence), icon: PoundSterling, accent: true },
    ];
  }, [metrics]);

  if (!cards) {
    return <div className="text-sm text-slate-500">Loading metrics…</div>;
  }

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={[
            'rounded-lg border px-4 py-3',
            c.accent
              ? 'border-accent/40 bg-accent/5 dark:bg-accent/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink',
          ].join(' ')}
        >
          <dt className="text-xs uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
            <c.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {c.label}
          </dt>
          <dd className={`mt-1 text-2xl font-bold ${c.accent ? 'text-accent' : 'text-slate-800 dark:text-slate-100'}`}>
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface MembersTableProps {
  members: MemberRow[];
  onRowClick: (m: MemberRow) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}

function MembersTable({ members, onRowClick, onLoadMore, hasMore, loadingMore }: MembersTableProps) {
  return (
    <section
      aria-labelledby="admin-members-heading"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink overflow-hidden"
    >
      <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 id="admin-members-heading" className="text-sm font-semibold">
          Members <span className="text-slate-500 font-normal">({members.length})</span>
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Tier</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">No members yet.</td>
              </tr>
            )}
            {members.map((m) => (
              <tr
                key={m.userId}
                onClick={() => onRowClick(m)}
                className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-3 cursor-pointer"
                data-testid={`admin-member-row-${m.userId}`}
              >
                <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{m.email ?? <em className="text-slate-400">no email</em>}</td>
                <td className="px-4 py-2"><TierBadge tier={m.tier} /></td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                  {m.subscriptionStatus === 'none' ? '—' : m.subscriptionStatus}
                  {m.cancelAtPeriodEnd && <span className="ml-1 text-xs text-amber-600">(cancels)</span>}
                </td>
                <td className="px-4 py-2 text-slate-500 text-xs">{formatDate(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <footer className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-sm text-accent hover:underline disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </footer>
      )}
    </section>
  );
}

function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section
      aria-labelledby="admin-activity-heading"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink"
    >
      <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h2 id="admin-activity-heading" className="text-sm font-semibold inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
          Recent activity
        </h2>
      </header>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 text-center">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.id} className="px-4 py-2 text-sm">
              <p className="text-slate-800 dark:text-slate-200">{ev.summary}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatRelative(ev.ts)} · <span className="font-mono">{ev.type}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const REASON_LABEL: Record<string, string> = {
  'ingredient-changed': 'Ingredient changed to a non-allergenic version',
  'recipe-changed': 'Recipe changed',
  'mistakenly-added': 'Tag was accidentally or mistakenly added',
  other: 'Other',
};

function AllergenAuditsPanel({ audits }: { audits: AllergenAuditRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4">
      <header className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Allergen-removal audits
        </h2>
        <span className="text-xs text-slate-400 ml-auto">{audits.length} total</span>
      </header>
      <p className="text-xs text-slate-500 mb-3">
        Every allergen tag removed by a signed-in chef syncs here. Anonymous removals stay
        on their device only.
      </p>
      {audits.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No audits yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-allergen-audits">
          {audits.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  {a.removedTag}
                </span>
                <time
                  className="text-[11px] text-slate-500"
                  dateTime={new Date(a.removedAt).toISOString()}
                >
                  {new Date(a.removedAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                <span className="text-slate-500">Recipe:</span> {a.recipeTitleAtTime}
              </p>
              <p className="mt-0.5 text-slate-700 dark:text-slate-200">
                <span className="text-slate-500">By:</span>{' '}
                {a.userDisplayName || '(no display name)'}{' '}
                <span className="text-[11px] text-slate-400">({a.userClerkId})</span>
              </p>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                {a.reasons.map((r) => REASON_LABEL[r] ?? r).join('; ')}
                {a.otherText ? ` — ${a.otherText}` : ''}
              </p>
              {a.ingredientsAtTime.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Ingredients at the time: {a.ingredientsAtTime.join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function D1AllergenAuditsPanel({ audits }: { audits: D1AllergenAuditRow[] }) {
  return (
    <section className="rounded-lg border border-emerald-300 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-900/10 p-4">
      <header className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Allergen removals (D1 — all chefs)
        </h2>
        <span className="text-xs text-slate-500 ml-auto">{audits.length} total</span>
      </header>
      <p className="text-xs text-slate-500 mb-3">
        Cross-user view sourced from the D1 sync table. Updates ~30s after each
        signed-in chef removes a tag. Server-authoritative — user_id comes from
        the verified Clerk JWT, never from the client.
      </p>
      {audits.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No audits yet in D1.</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-d1-allergen-audits">
          {audits.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-kitchen-ink p-3 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  {a.removedTag}
                  <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    D1
                  </span>
                </span>
                <time
                  className="text-[11px] text-slate-500"
                  dateTime={new Date(a.removedAt || a.updatedAt).toISOString()}
                >
                  {new Date(a.removedAt || a.updatedAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                <span className="text-slate-500">Recipe:</span>{' '}
                {a.recipeTitleAtTime || <em className="text-slate-400">(no title)</em>}
              </p>
              <p className="mt-0.5 text-slate-700 dark:text-slate-200">
                <span className="text-slate-500">By:</span>{' '}
                {a.userDisplayName || '(no display name)'}{' '}
                <span className="text-[11px] text-slate-400">({a.userClerkId})</span>
              </p>
              {a.reasons.length > 0 && (
                <p className="mt-1 text-slate-700 dark:text-slate-200">
                  {a.reasons.map((r) => REASON_LABEL[r] ?? r).join('; ')}
                  {a.otherText ? ` — ${a.otherText}` : ''}
                </p>
              )}
              {a.ingredientsAtTime.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Ingredients at the time: {a.ingredientsAtTime.join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactSubmissionsPanel({ submissions }: { submissions: ContactSubmissionRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4">
      <header className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contact submissions
        </h2>
        <span className="text-xs text-slate-400 ml-auto">{submissions.length} total</span>
      </header>
      {submissions.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No submissions yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="admin-contact-submissions">
          {submissions.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {s.name}{' '}
                  <a
                    href={`mailto:${s.email}?subject=Re:%20ChefFlow%20feedback`}
                    className="font-normal text-slate-500 hover:text-accent hover:underline"
                  >
                    &lt;{s.email}&gt;
                  </a>
                </span>
                <time
                  className="text-[11px] text-slate-500"
                  dateTime={new Date(s.createdAt).toISOString()}
                >
                  {new Date(s.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {s.message}
              </p>
              {s.screenshotDataUrl && (
                <a
                  href={s.screenshotDataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block"
                  title="Open screenshot in new tab"
                >
                  <img
                    src={s.screenshotDataUrl}
                    alt="Submitted screenshot"
                    className="max-h-48 rounded border border-slate-200 dark:border-slate-700"
                  />
                </a>
              )}
              <p className="mt-1 text-[11px] text-slate-400">IP: {s.ip}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface MemberDrawerProps {
  member: MemberRow;
  onClose: () => void;
  onChange: (patch: Partial<MemberRow>) => void;
}

function MemberDrawer({ member, onClose, onChange }: MemberDrawerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run<T>(label: string, op: () => Promise<T>, after?: (r: T) => void) {
    setBusy(label);
    setActionError(null);
    setActionInfo(null);
    try {
      const out = await op();
      after?.(out);
    } catch (err) {
      setActionError(err instanceof AdminClientError ? err.message : err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-drawer-title"
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md bg-white dark:bg-kitchen-ink shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="admin-drawer-title" className="text-base font-semibold truncate">
              {member.email ?? member.userId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{member.userId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 shrink-0">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <section className="px-5 py-4 space-y-3 text-sm">
          <DetailRow label="Tier"><TierBadge tier={member.tier} /></DetailRow>
          <DetailRow label="Role">{member.role ?? '—'}</DetailRow>
          <DetailRow label="Stripe customer">{member.stripeCustomerId ?? '—'}</DetailRow>
          <DetailRow label="Subscription status">
            {member.subscriptionStatus}{member.cancelAtPeriodEnd && ' (cancels at period end)'}
          </DetailRow>
          <DetailRow label="Joined">{formatDate(member.createdAt)}</DetailRow>
        </section>

        <section className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Actions</h3>

          {member.tier === 'free' ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('grant', () => grantPro(member.userId), () => {
                onChange({ tier: 'pro' });
                setActionInfo('Comp Pro granted. Clerk metadata updated.');
              })}
              className="btn-primary w-full disabled:opacity-60"
              data-testid="admin-grant-pro"
            >
              {busy === 'grant' ? 'Granting…' : 'Grant Pro (comp)'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run('revoke', () => revokePro(member.userId), () => {
                onChange({ tier: 'free' });
                setActionInfo('Tier downgraded to Free.');
              })}
              className="btn-secondary w-full disabled:opacity-60"
              data-testid="admin-revoke-pro"
            >
              {busy === 'revoke' ? 'Revoking…' : 'Revoke Pro'}
            </button>
          )}

          {member.stripeCustomerId && member.subscriptionStatus !== 'none' && member.subscriptionStatus !== 'canceled' && (
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={atPeriodEnd}
                  onChange={(e) => setAtPeriodEnd(e.target.checked)}
                  className="accent-accent"
                />
                Cancel at period end (keeps access until billing date)
              </label>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(
                  'cancel',
                  () => cancelSubscription(member.userId, atPeriodEnd),
                  (r) => {
                    onChange({ subscriptionStatus: r.status, cancelAtPeriodEnd: r.cancelAtPeriodEnd });
                    setActionInfo(atPeriodEnd ? 'Subscription will cancel at period end.' : 'Subscription canceled immediately.');
                  },
                )}
                className="btn-secondary w-full disabled:opacity-60"
                data-testid="admin-cancel-sub"
              >
                {busy === 'cancel' ? 'Canceling…' : 'Cancel subscription'}
              </button>
            </div>
          )}

          {member.stripeCustomerId && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (!window.confirm('Refund the most recent succeeded charge for this customer?')) return;
                void run('refund', () => refundLatestCharge(member.userId), (r) => {
                  setActionInfo(`Refunded ${formatPence(r.amount)} ${r.currency.toUpperCase()} (${r.refundId}).`);
                });
              }}
              className="btn-secondary w-full disabled:opacity-60"
              data-testid="admin-refund"
            >
              {busy === 'refund' ? 'Refunding…' : 'Refund latest charge'}
            </button>
          )}

          {actionError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{actionError}</p>
          )}
          {actionInfo && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{actionInfo}</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500 shrink-0">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-200 text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}

function TierBadge({ tier }: { tier: MemberRow['tier'] }) {
  const cls = tier === 'pro'
    ? 'bg-accent/15 text-accent'
    : tier === 'business'
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {TIER_LABEL[tier]}
    </span>
  );
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 10);
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  const m = Math.floor(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
