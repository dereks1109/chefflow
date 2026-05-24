// Triggers the worker's idempotent /api/demos/provision route. Fires once
// per browser session per signed-in user; the worker also gates with a KV
// marker, so even multiple call sites here are safe.
//
// Called from SyncRunner after the anon-row migration, before the first
// pull — so demo rows land in D1, then get pulled down into Dexie on the
// same boot round-trip.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface ProvisionResult {
  alreadyProvisioned: boolean;
  recipesInserted: number;
  eventsInserted: number;
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

function isE2E(): boolean {
  return (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
}

export async function provisionDemos(opts: { fetchImpl?: typeof fetch; origin?: string } = {}): Promise<ProvisionResult> {
  if (isE2E()) {
    return { alreadyProvisioned: true, recipesInserted: 0, eventsInserted: 0 };
  }
  const token = await getClerkToken();
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
