// POST /api/onboarding/complete client. Mirrors provisionClient's
// getToken-injection pattern (see provisionClient.ts) so the OnboardingSheet
// can hand in useAuth().getToken from React-land.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface OnboardingFields {
  displayName?: string;
  showNameOnCommunity?: boolean;
  // avatarDataUrl is intentionally NOT round-tripped to Clerk — Clerk has
  // a 16 KB cap on publicMetadata and avatar data URLs blow past that. The
  // sheet writes the avatar straight to useProfileStore (localStorage).
}

export interface CompleteOnboardingOpts {
  getToken: () => Promise<string | null>;
  fields: OnboardingFields;
  fetchImpl?: typeof fetch;
  origin?: string;
}

function isE2E(): boolean {
  return (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
}

export async function completeOnboarding(opts: CompleteOnboardingOpts): Promise<{ ok: true }> {
  if (isE2E()) return { ok: true };
  const token = await opts.getToken();
  if (!token) throw new Error('Not signed in');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/api/onboarding/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.fields),
  });
  if (!res.ok) throw new Error(`Onboarding completion failed: ${res.status}`);
  return { ok: true };
}
