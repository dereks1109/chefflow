// Onboarding completion handler. Persists the chef's profile prefs into
// Clerk's publicMetadata so any device the user signs in on can read the
// "onboardingComplete" flag without a worker round-trip.
//
// Why Clerk metadata and not D1: this is a one-shot per-user gate. Clerk's
// publicMetadata is already replicated to every signed-in session and is
// readable by the SPA via useUser().publicMetadata — saves us a sync table.
//
// We PATCH /v1/users/<id>/metadata (the merge endpoint), NOT /v1/users/<id>
// directly — the latter would replace the whole public_metadata object and
// wipe out tier/role/stripeCustomerId set by admin.ts + tier.ts.

import type { FetchLike } from './tier';

export interface OnboardingProfile {
  displayName?: string;
  showNameOnCommunity?: boolean;
}

export interface CompleteOnboardingResult {
  ok: true;
}

export class OnboardingError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export async function completeOnboarding(
  userId: string,
  clerkSecret: string,
  profile: OnboardingProfile,
  fetchImpl: FetchLike = fetch,
): Promise<CompleteOnboardingResult> {
  // Build the patch: always set onboardingComplete; only spread profile
  // fields when the user actually filled them (skip path sends {}).
  const profileSlice: Record<string, string | boolean> = {};
  if (typeof profile.displayName === 'string' && profile.displayName.trim().length > 0) {
    profileSlice.displayName = profile.displayName.trim();
  }
  if (typeof profile.showNameOnCommunity === 'boolean') {
    profileSlice.showNameOnCommunity = profile.showNameOnCommunity;
  }

  const body = {
    public_metadata: {
      onboardingComplete: true,
      ...(Object.keys(profileSlice).length > 0 ? { profile: profileSlice } : {}),
    },
  };

  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${clerkSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore body-read failures
    }
    throw new OnboardingError(
      `Clerk publicMetadata update failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    );
  }

  return { ok: true };
}
