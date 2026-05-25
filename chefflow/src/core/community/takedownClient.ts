// Client for the notice-and-takedown endpoints. Public submit + admin
// queue + admin resolve. Mirrors the getToken-injection pattern used by
// provisionClient and onboardingClient.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export type ReasonCode = 'copyright' | 'allergen_misinfo' | 'spam' | 'other';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type ResolutionAction = 'unpublish' | 'dismiss';

export interface TakedownReport {
  id: string;
  community_recipe_id: string;
  reporter_user_id: string;
  reporter_email: string | null;
  reason_code: ReasonCode;
  message: string | null;
  status: ReportStatus;
  reported_at: number;
  resolved_at: number | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
}

interface Opts {
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin?: string;
}

async function authedFetch(
  opts: Opts,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await opts.getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  return fetchImpl(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export interface SubmitReportInput {
  communityRecipeId: string;
  reasonCode: ReasonCode;
  message?: string;
  reporterEmail?: string;
}

export async function submitTakedownReport(
  opts: Opts & { input: SubmitReportInput },
): Promise<{ id: string }> {
  const res = await authedFetch(opts, '/api/community/report', {
    method: 'POST',
    body: JSON.stringify(opts.input),
  });
  if (!res.ok) throw new Error(`Takedown report failed: ${res.status}`);
  return (await res.json()) as { id: string };
}

export async function listTakedownReports(
  opts: Opts & { status?: ReportStatus; limit?: number },
): Promise<TakedownReport[]> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.limit) params.set('limit', String(opts.limit));
  const path = `/api/admin/takedown-reports${params.toString() ? '?' + params.toString() : ''}`;
  const res = await authedFetch(opts, path, { method: 'GET' });
  if (!res.ok) throw new Error(`Takedown list failed: ${res.status}`);
  const body = (await res.json()) as { reports: TakedownReport[] };
  return body.reports;
}

export async function resolveTakedownReport(
  opts: Opts & { reportId: string; action: ResolutionAction; note?: string | null },
): Promise<{ status: ReportStatus; unpublishedRecipeId: string | null }> {
  const res = await authedFetch(opts, `/api/admin/takedown-reports/${opts.reportId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action: opts.action, note: opts.note ?? null }),
  });
  if (!res.ok) throw new Error(`Takedown resolve failed: ${res.status}`);
  return (await res.json()) as { status: ReportStatus; unpublishedRecipeId: string | null };
}
