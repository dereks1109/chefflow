// GET /api/account/export — pulls a single JSON blob of every row the
// signed-in user owns across the four synced D1 tables + their community
// recipes. Triggers a browser download via Content-Disposition. Pure
// pass-through; no client-side transformation.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

interface Opts {
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin?: string;
}

export interface AccountExport {
  userId: string;
  exportedAt: number;
  schemaVersion: number;
  tables: Record<string, Array<{ id: string; updated_at: number; is_deleted: 0 | 1; payload: unknown }>>;
  communityRecipes: unknown[];
}

export async function exportAccount(opts: Opts): Promise<AccountExport> {
  const token = await opts.getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/api/account/export`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Account export failed: ${res.status}`);
  return (await res.json()) as AccountExport;
}
