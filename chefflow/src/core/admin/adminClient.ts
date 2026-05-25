import { getWorkerBaseUrl } from '../util/workerBaseUrl';
import type { Tier } from '../tier/limits';

// ---------------------------------------------------------------------------
// Client for chefflow-worker /admin/* endpoints. Mirrors quotaClient — same
// Clerk JWT bearer, same getWorkerBaseUrl override pattern.
//
// All endpoints 403 unless the caller's Clerk publicMetadata.role === 'admin'.
// ---------------------------------------------------------------------------

export class AdminClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminClientError';
    this.status = status;
  }
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = globalThis.fetch,
  origin?: string,
): Promise<T> {
  const token = await getClerkToken();
  if (!token) throw new AdminClientError('Not signed in', 401);
  const base = (origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    let msg = `Admin worker ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new AdminClientError(msg, res.status);
  }
  return (await res.json()) as T;
}

// ---- Types mirror the worker's admin.ts return shapes. ----

export interface MemberRow {
  userId: string;
  email: string | null;
  tier: Tier;
  role: string | null;
  createdAt: number;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ListMembersResult {
  members: MemberRow[];
  nextOffset: number | null;
}

export interface MetricsResult {
  totalMembers: number;
  byTier: Record<Tier, number>;
  mrrPence: number;
  payingSubscribers: number;
  computedAt: number;
}

export interface ActivityEvent {
  id: string;
  ts: number;
  type: string;
  customerId: string | null;
  summary: string;
}

// ---- Public API. ----

export function listMembers(offset = 0, limit = 50): Promise<ListMembersResult> {
  return adminFetch<ListMembersResult>(`/admin/members?offset=${offset}&limit=${limit}`, { method: 'GET' });
}

export function getMetrics(): Promise<MetricsResult> {
  return adminFetch<MetricsResult>('/admin/metrics', { method: 'GET' });
}

export function getActivity(): Promise<{ events: ActivityEvent[] }> {
  return adminFetch<{ events: ActivityEvent[] }>('/admin/activity', { method: 'GET' });
}

export interface ContactSubmissionRow {
  id: string;
  name: string;
  email: string;
  message: string;
  screenshotDataUrl?: string;
  ip: string;
  createdAt: number;
}

export function listContactSubmissions(): Promise<{ items: ContactSubmissionRow[] }> {
  return adminFetch<{ items: ContactSubmissionRow[] }>('/admin/contact-submissions', { method: 'GET' });
}

export interface AllergenAuditRow {
  id: string;
  recipeId: string;
  recipeTitleAtTime: string;
  removedTag: string;
  reasons: string[];
  otherText?: string;
  ingredientsAtTime: string[];
  removedAt: number;
  userClerkId: string;
  userDisplayName?: string;
  receivedAt: number;
}

export function listAllergenAudits(): Promise<{ items: AllergenAuditRow[] }> {
  return adminFetch<{ items: AllergenAuditRow[] }>('/admin/allergen-audits', { method: 'GET' });
}

// Cross-user D1-backed view. Same logical row as the KV path but sourced from
// the sync engine's allergen_audits table — every signed-in chef's removals
// land here ~30s after the click, with no need for the bespoke KV push.
export interface D1AllergenAuditRow {
  id: string;
  userClerkId: string;
  updatedAt: number;
  recipeId: string;
  recipeTitleAtTime: string;
  removedTag: string;
  reasons: string[];
  otherText?: string;
  ingredientsAtTime: string[];
  removedAt: number;
  userDisplayName?: string;
}

export function listD1AllergenAudits(): Promise<{ items: D1AllergenAuditRow[] }> {
  return adminFetch<{ items: D1AllergenAuditRow[] }>('/admin/d1/allergen-audits', { method: 'GET' });
}

export function grantPro(userId: string): Promise<{ ok: true; tier: 'pro' }> {
  return adminFetch(`/admin/members/${encodeURIComponent(userId)}/grant-pro`, { method: 'POST' });
}

export function revokePro(userId: string): Promise<{ ok: true; tier: 'free' }> {
  return adminFetch(`/admin/members/${encodeURIComponent(userId)}/revoke-pro`, { method: 'POST' });
}

export function cancelSubscription(
  userId: string,
  atPeriodEnd: boolean,
): Promise<{ ok: true; subscriptionId: string; status: string; cancelAtPeriodEnd: boolean }> {
  return adminFetch(`/admin/members/${encodeURIComponent(userId)}/cancel-subscription`, {
    method: 'POST',
    body: JSON.stringify({ atPeriodEnd }),
  });
}

export function refundLatestCharge(
  userId: string,
): Promise<{ ok: true; refundId: string; amount: number; currency: string }> {
  return adminFetch(`/admin/members/${encodeURIComponent(userId)}/refund`, { method: 'POST' });
}
