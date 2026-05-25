// Triggers the worker's idempotent /api/demos/provision route. The worker
// gates with a KV marker, so repeat calls are cheap (a single KV read).
//
// `getToken` is injected (typically from `useAuth().getToken` in
// SyncRunner) so this module never reaches into window.Clerk — the previous
// version did, and lost a race on first sign-in where `window.Clerk.session`
// hadn't populated yet, dropping the call silently.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface ProvisionResult {
  alreadyProvisioned: boolean;
  recipesInserted: number;
  eventsInserted: number;
}

export interface ProvisionDemosOpts {
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin?: string;
}

function isE2E(): boolean {
  return (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
}

export async function provisionDemos(opts: ProvisionDemosOpts): Promise<ProvisionResult> {
  if (isE2E()) {
    return { alreadyProvisioned: true, recipesInserted: 0, eventsInserted: 0 };
  }
  const token = await opts.getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/api/demos/provision`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Demo provision failed: ${res.status}`);
  return (await res.json()) as ProvisionResult;
}
