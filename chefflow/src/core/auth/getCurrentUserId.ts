// Synchronous Clerk userId reader.
//
// Why synchronous? The Dexie repos need to stamp `userId` on every write and
// filter every read. Wrapping the entire repo layer in async useUser() hooks
// would force a top-down React rewrite. Clerk exposes `window.Clerk.user.id`
// after the session loads — read it directly. Pre-session boot returns null.
//
// `anon:*` ids: the SyncRunner mounts BEFORE Clerk resolves, and the user
// might still create/edit rows locally. We mint a stable per-tab anon id so
// those rows can later be migrated to the real Clerk userId on sign-in.

const ANON_SESSION_KEY = 'chefflow:anon-session-id';

interface ClerkLike {
  user?: { id?: string } | null;
  loaded?: boolean;
}

function getClerk(): ClerkLike | undefined {
  return (window as unknown as { Clerk?: ClerkLike }).Clerk;
}

function readAnonId(): string {
  let id = window.localStorage.getItem(ANON_SESSION_KEY);
  if (!id) {
    id = `anon:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem(ANON_SESSION_KEY, id);
  }
  return id;
}

/**
 * Current row-owner id for Dexie writes + read filters.
 *   - Signed in via Clerk → the Clerk subject (`Clerk.user.id`)
 *   - Otherwise → a stable per-browser `anon:*` id from localStorage
 *
 * Never returns null. Pre-session boot returns the anon id so rows created
 * during the brief boot window are still tagged and can later be migrated.
 */
export function getCurrentUserId(): string {
  const clerk = getClerk();
  const realId = clerk?.user?.id;
  if (realId) return realId;
  return readAnonId();
}

/** True when the current user is signed in via Clerk (not anonymous). */
export function isSignedIn(): boolean {
  const clerk = getClerk();
  return Boolean(clerk?.user?.id);
}

/** Convenience for the first-sign-in migration — list ids that should be
 *  treated as "anonymous and re-stampable". */
export function isAnonUserId(id: string | undefined): boolean {
  return !id || id.startsWith('anon:');
}
