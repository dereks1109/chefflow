import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  inviteMember,
  acceptInvite,
  listMembers,
  removeMember,
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  TeamsClientError,
} from './teamsClient';

beforeEach(() => {
  // Stub window.Clerk so getClerkToken() returns a real-shape token.
  (window as unknown as { Clerk?: unknown }).Clerk = {
    session: { getToken: async () => 'jwt.test.token' },
  };
});

function fetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

function fetchErr(status: number, body: { error?: string } = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('teamsClient', () => {
  // Why these matter: this client is the only call-site for the worker's
  // /api/teams/* endpoints. A regression here (wrong method, wrong body,
  // missing token) breaks the entire team-invite flow silently. The tests
  // pin shape, auth, and error surfacing so the UI can rely on them.

  it('inviteMember POSTs to /api/teams/invite with Bearer + JSON body, returns the token + acceptUrl', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          email: 'sous@k.uk',
          token: 'tok_abc',
          acceptUrl: 'https://chefflow.uk/teams/accept?token=tok_abc',
          emailStatus: 'sent',
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const out = await inviteMember('sous@k.uk', { origin: 'https://api.test', fetchImpl });

    expect(out.token).toBe('tok_abc');
    expect(out.emailStatus).toBe('sent');
    expect(capturedUrl).toBe('https://api.test/api/teams/invite');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test.token');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ email: 'sous@k.uk' });
  });

  it('surfaces the worker\'s error message on non-2xx so the UI can render it verbatim', async () => {
    const fetchImpl = fetchErr(409, { error: 'Tier free seat cap reached (1/1)' });
    try {
      await inviteMember('a@x.com', { fetchImpl });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TeamsClientError);
      expect((err as TeamsClientError).message).toBe('Tier free seat cap reached (1/1)');
      expect((err as TeamsClientError).status).toBe(409);
    }
  });

  it('throws "Not signed in" 401 when no Clerk session is available (page loaded before Clerk hydrated)', async () => {
    (window as unknown as { Clerk?: unknown }).Clerk = { session: { getToken: async () => null } };
    await expect(inviteMember('a@x.com')).rejects.toMatchObject({ status: 401 });
  });

  it('acceptInvite POSTs the token and returns the ownerUserId + memberEmail on success', async () => {
    const fetchImpl = fetchOk({ ownerUserId: 'user_owner', memberEmail: 'me@x' });
    const out = await acceptInvite('tok_xyz', { fetchImpl });
    expect(out.ownerUserId).toBe('user_owner');
    expect(out.memberEmail).toBe('me@x');
  });

  it('listMembers GETs /api/teams/list and returns the members array', async () => {
    const fetchImpl = fetchOk({
      members: [
        { member_email: 'a@x', member_user_id: null, role: 'viewer', invited_at: 1, accepted_at: null },
        { member_email: 'b@x', member_user_id: 'u_b', role: 'viewer', invited_at: 2, accepted_at: 3 },
      ],
    });
    const out = await listMembers({ fetchImpl });
    expect(out).toHaveLength(2);
    expect(out[0].member_email).toBe('a@x');
    expect(out[1].accepted_at).toBe(3);
  });

  it('removeMember URL-encodes the email so addresses with + or . round-trip safely', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ removed: 'a+test@x.com' }), { status: 200 });
    }) as unknown as typeof fetch;
    await removeMember('a+test@x.com', { origin: 'https://api.test', fetchImpl });
    expect(capturedUrl).toBe('https://api.test/api/teams/a%2Btest%40x.com');
  });

  it('inviteMember threads opts.groupId into the body so an owner can invite into a specific group (T4 Phase 2)', async () => {
    let capturedBody = '';
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({ email: 'a@x', token: 't', acceptUrl: 'u', emailStatus: 'sent' }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    await inviteMember('a@x', { fetchImpl, groupId: 'grp_morning' });
    expect(JSON.parse(capturedBody)).toEqual({ email: 'a@x', groupId: 'grp_morning' });
  });

  it('listGroups GETs /api/teams/groups and returns the groups array', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        groups: [
          { id: 'grp_d', name: 'Default', isDefault: true },
          { id: 'grp_m', name: 'Morning', isDefault: false },
        ],
      }), { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await listGroups({ fetchImpl });
    expect(out).toHaveLength(2);
    expect(out[0].isDefault).toBe(true);
    expect(out[1].name).toBe('Morning');
  });

  it('createGroup POSTs the name and returns the new group', async () => {
    let capturedBody = '';
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({ id: 'grp_x', name: 'Morning', isDefault: false }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await createGroup('Morning', { fetchImpl });
    expect(out.id).toBe('grp_x');
    expect(JSON.parse(capturedBody)).toEqual({ name: 'Morning' });
  });

  it('createGroup surfaces the worker\'s 409 message verbatim (duplicate name)', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'A group with that name already exists' }), { status: 409 }),
    ) as unknown as typeof fetch;
    try {
      await createGroup('Morning', { fetchImpl });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TeamsClientError);
      expect((err as TeamsClientError).status).toBe(409);
      expect((err as TeamsClientError).message).toMatch(/already exists/i);
    }
  });

  it('renameGroup PATCHes /api/teams/groups/:id with the new name', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedMethod = '';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = String(init?.body ?? '');
      capturedMethod = String(init?.method ?? '');
      return new Response(JSON.stringify({ id: 'grp_m', name: 'Morning shift' }), { status: 200 });
    }) as unknown as typeof fetch;
    await renameGroup('grp_m', 'Morning shift', { origin: 'https://api.test', fetchImpl });
    expect(capturedUrl).toBe('https://api.test/api/teams/groups/grp_m');
    expect(capturedMethod).toBe('PATCH');
    expect(JSON.parse(capturedBody)).toEqual({ name: 'Morning shift' });
  });

  it('deleteGroup DELETEs /api/teams/groups/:id', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = String(init?.method ?? '');
      return new Response(JSON.stringify({ removed: 'grp_m', movedToDefault: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await deleteGroup('grp_m', { origin: 'https://api.test', fetchImpl });
    expect(capturedUrl).toBe('https://api.test/api/teams/groups/grp_m');
    expect(capturedMethod).toBe('DELETE');
  });
});
