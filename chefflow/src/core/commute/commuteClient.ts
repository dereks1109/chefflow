// POST /api/commute/estimate client. Mirrors the JWT-injection pattern
// used elsewhere (provisionClient, onboardingClient): the caller hands
// in `getToken` from useAuth() so React components don't need to thread
// Clerk through to this module.
//
// Fail modes — the SPA's commute banner treats every non-success state
// as "hide the banner silently":
//   - 503 + fallback=no-key  — admin hasn't set GOOGLE_MAPS_API_KEY yet
//   - 502 + fallback=maps-failed — Google Maps returned a non-OK status
//   - network / 401 / 500 — handled by callers as a noisy log

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface CommuteEstimateInput {
  origin: string;
  destination: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  origin_override_for_tests?: string;
}

export interface CommuteEstimateOk {
  ok: true;
  durationSeconds: number;
  distanceMeters: number;
  resolvedOrigin: string;
  resolvedDestination: string;
}

export interface CommuteEstimateFallback {
  ok: false;
  fallback: 'no-key' | 'maps-failed' | 'unauthorised' | 'network';
  message?: string;
}

export type CommuteEstimateResult = CommuteEstimateOk | CommuteEstimateFallback;

export async function estimateCommute(input: CommuteEstimateInput): Promise<CommuteEstimateResult> {
  const token = await input.getToken();
  if (!token) return { ok: false, fallback: 'unauthorised' };
  const base = (input.origin_override_for_tests ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${base}/api/commute/estimate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: input.origin, destination: input.destination }),
    });
  } catch (err) {
    return { ok: false, fallback: 'network', message: err instanceof Error ? err.message : String(err) };
  }
  if (res.ok) {
    const body = (await res.json()) as Omit<CommuteEstimateOk, 'ok'>;
    return { ok: true, ...body };
  }
  // Parse worker fallback. Status 503 / 502 carry { fallback }.
  let parsed: { fallback?: string; error?: string } = {};
  try { parsed = await res.json() as { fallback?: string; error?: string }; } catch { /* ignore */ }
  const fallback =
    parsed.fallback === 'no-key' ? 'no-key' :
    parsed.fallback === 'maps-failed' ? 'maps-failed' :
    res.status === 401 ? 'unauthorised' : 'maps-failed';
  return { ok: false, fallback, message: parsed.error };
}
