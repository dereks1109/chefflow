// Bootstrap helper — set / replace the ChefFlow admin by email address.
//
// Backstory: admin is a `publicMetadata.role === 'admin'` flag on a Clerk
// user. Today it's set manually via the Clerk Dashboard, but Cloudflare's
// canonical `admin@chefflow.uk` Workspace mailbox is the address we want
// to centralise on. This helper resolves a Clerk user by email and PATCHes
// their role to 'admin', while also stripping role=admin from any other
// user (so "replace" semantics — the recommended path).
//
// Wired into a one-shot POST /admin/bootstrap?email=… endpoint gated by a
// `ADMIN_BOOTSTRAP_TOKEN` worker secret so the operation is callable
// before any admin exists (chicken-and-egg). Delete the secret after use.

import type { FetchLike } from './tier';

export class AdminBootstrapError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AdminBootstrapError';
  }
}

interface ClerkUser {
  id: string;
  public_metadata?: Record<string, unknown>;
}

async function listAdmins(clerkSecret: string, fetchImpl: FetchLike): Promise<ClerkUser[]> {
  // Clerk doesn't support a server-side filter on metadata, so we paginate
  // through every user. For a single-tenant SaaS at the scale ChefFlow
  // runs today (< 10k users) this is fine; revisit if user count climbs.
  const out: ClerkUser[] = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const res = await fetchImpl(`https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (!res.ok) {
      throw new AdminBootstrapError(`Clerk users list failed (${res.status})`, res.status);
    }
    const page = (await res.json()) as ClerkUser[];
    if (!Array.isArray(page) || page.length === 0) break;
    for (const u of page) {
      if (u.public_metadata && u.public_metadata.role === 'admin') out.push(u);
    }
    if (page.length < limit) break;
    offset += limit;
  }
  return out;
}

async function patchRole(
  userId: string,
  role: string | null,
  clerkSecret: string,
  fetchImpl: FetchLike,
): Promise<void> {
  // Use the /metadata merge endpoint so we don't clobber other fields
  // (tier, stripeCustomerId, tosAcceptedAt, …). Clerk treats `null` as
  // "remove this key".
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${clerkSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_metadata: { role } }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new AdminBootstrapError(
      `Clerk metadata PATCH for ${userId} failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    );
  }
}

export interface SetAdminResult {
  promotedUserId: string;
  demotedUserIds: string[];
}

/** Resolve the Clerk user with the given email, set their role=admin, and
 *  strip role=admin from every other user. Throws AdminBootstrapError
 *  with status 404 if no user matches the email. */
export async function setAdminByEmail(
  email: string,
  clerkSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<SetAdminResult> {
  if (!email || !email.includes('@')) {
    throw new AdminBootstrapError('email must be a valid address', 400);
  }
  // Look up the target user by email.
  const lookupRes = await fetchImpl(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${clerkSecret}` } },
  );
  if (!lookupRes.ok) {
    throw new AdminBootstrapError(
      `Clerk user lookup failed (${lookupRes.status})`,
      lookupRes.status,
    );
  }
  const users = (await lookupRes.json()) as ClerkUser[];
  if (!Array.isArray(users) || users.length === 0) {
    throw new AdminBootstrapError(`No Clerk user found for ${email}`, 404);
  }
  const target = users[0];

  // Strip role=admin from existing admins (except the target — no-op if
  // the target is already admin since we re-set them right after).
  const existing = await listAdmins(clerkSecret, fetchImpl);
  const demoted: string[] = [];
  for (const u of existing) {
    if (u.id === target.id) continue;
    await patchRole(u.id, null, clerkSecret, fetchImpl);
    demoted.push(u.id);
  }

  // Promote target.
  await patchRole(target.id, 'admin', clerkSecret, fetchImpl);

  return { promotedUserId: target.id, demotedUserIds: demoted };
}
