// DELETE /api/account — GDPR Article 17 erasure. Irreversible: D1 rows,
// community publications, and Clerk user all gone after this returns 200.
// The SPA should follow up with clerk.signOut() — Clerk's session is
// invalidated server-side but the local session cache may still report
// the user as signed in until the next request.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

interface Opts {
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin?: string;
}

export interface DeleteAccountResult {
  deleted: Record<string, number>;
  communityRecipesUnpublished: number;
  clerkDeleted: boolean;
}

export async function deleteAccount(opts: Opts): Promise<DeleteAccountResult> {
  const token = await opts.getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/api/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Account deletion failed: ${res.status}`);
  return (await res.json()) as DeleteAccountResult;
}
