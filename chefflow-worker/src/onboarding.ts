// Onboarding completion handler. Persists the chef's profile prefs + ToS
// acceptance into Clerk's publicMetadata, and writes a redundant audit
// row to D1 `tos_acceptances`.
//
// Why both Clerk AND D1: Clerk's publicMetadata is the runtime gate (the
// SPA reads `useUser().publicMetadata.tosVersion` to decide whether to
// show the re-acceptance banner), so it MUST be set or the gate breaks
// the next time the user signs in. D1 is the legal-defence audit trail —
// it's our data, we control it, we can produce it. The two stay in sync
// best-effort; if Clerk succeeds but D1 fails we still consider
// onboarding done (Clerk is the source of truth for the gate) and log
// the D1 failure for ops follow-up.
//
// We PATCH /v1/users/<id>/metadata (the merge endpoint), NOT /v1/users/<id>
// directly — the latter would replace the whole public_metadata object and
// wipe out tier/role/stripeCustomerId set by admin.ts + tier.ts.

import type { FetchLike } from './tier';

export interface OnboardingProfile {
  displayName?: string;
  showNameOnCommunity?: boolean;
  /** ISO timestamp captured client-side when the chef ticked the
   *  acceptance checkbox. Required for the onboarding flow to complete. */
  tosAcceptedAt?: string;
  /** Version string of the ToS the chef saw. Mismatched against the
   *  current value by the re-acceptance nag flow. Required. */
  tosVersion?: string;
  /** Version string of the Disclaimer the chef saw. Required. */
  disclaimerVersion?: string;
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

export interface CompleteOnboardingDeps {
  db?: D1Database;
  /** Request IP + UA for the audit row; both nullable since the SPA
   *  doesn't know its egress IP and the worker reads them off the
   *  request. */
  ip?: string | null;
  userAgent?: string | null;
  /** Test-injectable id + clock so unit tests are deterministic. */
  idGen?: () => string;
  now?: () => number;
}

export async function completeOnboarding(
  userId: string,
  clerkSecret: string,
  profile: OnboardingProfile,
  fetchImpl: FetchLike = fetch,
  deps: CompleteOnboardingDeps = {},
): Promise<CompleteOnboardingResult> {
  if (!profile.tosAcceptedAt || !profile.tosVersion || !profile.disclaimerVersion) {
    throw new OnboardingError(
      'tosAcceptedAt, tosVersion, and disclaimerVersion are required',
      400,
    );
  }

  // Build the profile slice: only spread fields the user actually filled
  // when they didn't take the Skip path.
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
      tosAcceptedAt: profile.tosAcceptedAt,
      tosVersion: profile.tosVersion,
      disclaimerVersion: profile.disclaimerVersion,
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

  // Best-effort D1 audit row. Failure here logs a warn but does NOT throw —
  // Clerk metadata is the runtime gate; D1 is the redundant legal record.
  if (deps.db) {
    const id = deps.idGen ? deps.idGen() : crypto.randomUUID();
    const acceptedAtMs = Date.parse(profile.tosAcceptedAt);
    const now = Number.isFinite(acceptedAtMs) ? acceptedAtMs : (deps.now ? deps.now() : Date.now());
    try {
      await deps.db
        .prepare(
          'INSERT INTO tos_acceptances (id, user_id, accepted_at, tos_version, disclaimer_version, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          userId,
          now,
          profile.tosVersion,
          profile.disclaimerVersion,
          deps.ip ?? null,
          deps.userAgent ?? null,
        )
        .run();
    } catch (err) {
      console.warn('[onboarding] tos_acceptances insert failed (Clerk metadata still set):', err instanceof Error ? err.message : String(err));
    }
  }

  return { ok: true };
}
