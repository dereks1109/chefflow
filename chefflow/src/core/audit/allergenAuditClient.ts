import type { AllergenAuditEntry } from '../types';
import { getWorkerBaseUrl } from '../util/workerBaseUrl';

interface PushOpts {
  origin?: string;
  fetchImpl?: typeof fetch;
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

/**
 * Push an audit entry to the central worker log. Returns true on success,
 * false on any failure (network, 401, validation). Callers can use the
 * result to flip the local `synced` flag — but should NOT depend on
 * success: the local Dexie row is still the source of truth.
 *
 * Anonymous (signed-out) users return false silently — no token, no push.
 */
export async function pushAllergenAudit(
  entry: AllergenAuditEntry,
  opts: PushOpts = {},
): Promise<boolean> {
  if (isE2E()) return false;
  // Only signed-in chefs sync — anonymous removals stay local-only.
  if (!entry.userClerkId) return false;
  const token = await getClerkToken();
  if (!token) return false;

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const origin = (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  try {
    const res = await fetchImpl(`${origin}/audit/allergen-removal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: entry.id,
        recipeId: entry.recipeId,
        recipeTitleAtTime: entry.recipeTitleAtTime,
        removedTag: entry.removedTag,
        reasons: entry.reasons,
        otherText: entry.otherText,
        ingredientsAtTime: entry.ingredientsAtTime,
        removedAt: entry.removedAt,
        userDisplayName: entry.userDisplayName,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
