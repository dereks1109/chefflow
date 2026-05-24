// Tiny framework-free holder for the signed-in Clerk userId. The db repos
// import this directly so they can filter by owner without depending on
// React. `App.tsx` keeps it in sync with Clerk's `useUser()` hook.

let currentUserId: string | null = null;

export function setCurrentUserId(id: string | null): void {
  currentUserId = id;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

// Repos call this when they need the user — throwing here is more useful
// than silently returning empty arrays from listRecipes/etc. when a caller
// forgot to wait for sign-in.
export function requireCurrentUserId(): string {
  if (!currentUserId) {
    throw new Error('No signed-in user — cannot access user-scoped data');
  }
  return currentUserId;
}
