// Client for the worker's /pin/recovery/* endpoints. Mirrors the
// shape of communityClient.ts — same Clerk JWT fetch, same E2E
// short-circuit. The PIN itself lives in localStorage and never
// crosses the wire; this client only handles the email proof-of-
// access dance.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export class PinRecoveryError extends Error {
  readonly status: number;
  readonly reason?: string;
  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = 'PinRecoveryError';
    this.status = status;
    this.reason = reason;
  }
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

interface Options {
  origin?: string;
  fetchImpl?: typeof fetch;
}

function originOf(opts: Options): string {
  return (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
}

/** Email a 6-digit recovery code to the chef's primary Clerk email. */
export async function requestPinRecovery(
  opts: Options = {},
): Promise<{ emailHint?: string }> {
  if (isE2E()) return { emailHint: 'e2…@example.com' };
  const token = await getClerkToken();
  if (!token) throw new PinRecoveryError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/pin/recovery/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    throw new PinRecoveryError('Too many recovery attempts — try again in an hour.', 429, 'rate-limited');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
    throw new PinRecoveryError(body.error ?? `Recovery request failed (${res.status})`, res.status, body.reason);
  }
  return (await res.json()) as { emailHint?: string };
}

/** Verify a 6-digit code; on success the SPA clears the local PIN. */
export async function verifyPinRecovery(
  code: string,
  opts: Options = {},
): Promise<{ ok: true }> {
  if (isE2E()) return { ok: true };
  const token = await getClerkToken();
  if (!token) throw new PinRecoveryError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/pin/recovery/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    throw new PinRecoveryError('Invalid or expired code.', res.status, 'bad-code');
  }
  return { ok: true };
}
