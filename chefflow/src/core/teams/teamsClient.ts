// HTTP wrappers for the worker /api/teams/* routes (T3c Phase 2).
// Mirrors the auth + base-URL pattern of communityClient.ts so the
// SettingsPage TeamMembersSection (Phase 5) and the TeamAccept page
// can stay declarative — fetch + token + error class live here.

import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export interface TeamMember {
  member_email: string;
  member_user_id: string | null;
  role: 'viewer';
  invited_at: number;
  accepted_at: number | null;
  /** T4 Phase 1 — which group this member belongs to. May be null on
   *  pre-migration rows during the brief deploy window; the SettingsPage
   *  treats them as belonging to the Default group. */
  group_id?: string | null;
}

export interface TeamGroup {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt?: number;
  /** T11 — 'owner' for groups the caller created; 'member' for
   *  groups the caller has been invited into and accepted. Lets the
   *  SPA show member-only teams in /teams and gate write actions
   *  (rename, invite, remove, delete) on the owner-role rows. */
  role: 'owner' | 'member';
  /** T11 — clerk userId of the team's actual owner. Same as the
   *  caller when role === 'owner'. */
  ownerUserId: string;
}

export interface InviteResult {
  email: string;
  token: string;
  acceptUrl: string;
  emailStatus: 'sent' | 'skipped-no-key' | 'failed';
}

export interface AcceptResult {
  ownerUserId: string;
  memberEmail: string;
}

export class TeamsClientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TeamsClientError';
    this.status = status;
  }
}

interface Options {
  origin?: string;
  fetchImpl?: typeof fetch;
}

function originOf(opts: Options): string {
  return (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

async function authedFetch(
  url: string,
  init: RequestInit & { fetchImpl?: typeof fetch },
): Promise<Response> {
  const token = await getClerkToken();
  if (!token) throw new TeamsClientError('Not signed in', 401);
  const fetchImpl = init.fetchImpl ?? globalThis.fetch;
  const { fetchImpl: _drop, ...rest } = init;
  return fetchImpl(url, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function readError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) msg = body.error;
  } catch {
    // ignore
  }
  throw new TeamsClientError(msg, res.status);
}

/** Owner invites a member by email. Returns the accept URL the chef can
 *  copy if Resend isn't configured / the recipient's email is misspelled. */
export async function inviteMember(
  email: string,
  opts: Options & { groupId?: string } = {},
): Promise<InviteResult> {
  const body: { email: string; groupId?: string } = { email };
  if (opts.groupId) body.groupId = opts.groupId;
  const res = await authedFetch(`${originOf(opts)}/api/teams/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) return readError(res, 'Invite failed');
  return (await res.json()) as InviteResult;
}

/** Member accepts an invite via the token from the email URL. */
export async function acceptInvite(token: string, opts: Options = {}): Promise<AcceptResult> {
  const res = await authedFetch(`${originOf(opts)}/api/teams/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) return readError(res, 'Accept failed');
  return (await res.json()) as AcceptResult;
}

/** Owner lists pending + accepted members for their team. */
export async function listMembers(opts: Options = {}): Promise<TeamMember[]> {
  const res = await authedFetch(`${originOf(opts)}/api/teams/list`, {
    method: 'GET',
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) return readError(res, 'List failed');
  const body = (await res.json()) as { members: TeamMember[] };
  return body.members ?? [];
}

/** Owner revokes a pending invite or removes an accepted member. */
export async function removeMember(email: string, opts: Options = {}): Promise<void> {
  const res = await authedFetch(
    `${originOf(opts)}/api/teams/${encodeURIComponent(email)}`,
    { method: 'DELETE', fetchImpl: opts.fetchImpl },
  );
  if (!res.ok) return readError(res, 'Remove failed');
}

// ---------------------------------------------------------------------------
// T4 Phase 2 — Groups CRUD wrappers
// ---------------------------------------------------------------------------

/** Owner lists their named groups (Default first). */
export async function listGroups(opts: Options = {}): Promise<TeamGroup[]> {
  const res = await authedFetch(`${originOf(opts)}/api/teams/groups`, {
    method: 'GET',
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) return readError(res, 'List groups failed');
  const body = (await res.json()) as { groups: TeamGroup[] };
  return body.groups ?? [];
}

/** Owner creates a new named group. */
export async function createGroup(name: string, opts: Options = {}): Promise<TeamGroup> {
  const res = await authedFetch(`${originOf(opts)}/api/teams/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) return readError(res, 'Create group failed');
  return (await res.json()) as TeamGroup;
}

/** Owner renames a non-default group. */
export async function renameGroup(
  groupId: string,
  name: string,
  opts: Options = {},
): Promise<{ id: string; name: string }> {
  const res = await authedFetch(
    `${originOf(opts)}/api/teams/groups/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      fetchImpl: opts.fetchImpl,
    },
  );
  if (!res.ok) return readError(res, 'Rename group failed');
  return (await res.json()) as { id: string; name: string };
}

/** Owner deletes a non-default group; memberships cascade to Default. */
export async function deleteGroup(groupId: string, opts: Options = {}): Promise<void> {
  const res = await authedFetch(
    `${originOf(opts)}/api/teams/groups/${encodeURIComponent(groupId)}`,
    { method: 'DELETE', fetchImpl: opts.fetchImpl },
  );
  if (!res.ok) return readError(res, 'Delete group failed');
}
