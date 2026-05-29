import { describe, it, expect, vi } from 'vitest';
import {
  assertCanInvite,
  fetchUserEmail,
  handleAccept,
  handleDelete,
  handleInvite,
  handleList,
  handleOwnersOfMe,
  TeamSeatCapReached,
  type TeamsEnv,
} from './teams';

function makeCountingDb(rowsByOwner: Record<string, number>): D1Database {
  return {
    prepare(_sql: string) {
      let bound: string | undefined;
      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) {
          bound = args[0] as string;
          return stmt;
        },
        async first<T = unknown>() {
          const n = bound ? (rowsByOwner[bound] ?? 0) : 0;
          return { n } as unknown as T;
        },
        async all() {
          return { success: true, results: [], meta: {} } as unknown as D1Result;
        },
        async run() {
          return { success: true, meta: { changes: 0 }, results: [] } as unknown as D1Result;
        },
        async raw() {
          return [];
        },
      } as unknown as D1PreparedStatement;
      return stmt;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe('assertCanInvite', () => {
  // Why these tests matter: pending invites + accepted members both
  // "hold" a seat against TIER_LIMITS[tier].maxSeats. Getting the count
  // wrong either lets enterprise owners over-invite (revenue leak +
  // seat-cap meaningless) or locks them out early (support tickets).
  // The cap is enforced HERE — endpoints just call this then INSERT.

  it('does NOT throw when the owner is under the seat cap (enterprise: 50 seats)', async () => {
    const db = makeCountingDb({ u_owner: 5 });
    await expect(assertCanInvite(db, 'u_owner', 'enterprise')).resolves.toBeUndefined();
  });

  it('throws TeamSeatCapReached when the owner is AT the seat cap', async () => {
    const db = makeCountingDb({ u_owner: 50 });
    await expect(assertCanInvite(db, 'u_owner', 'enterprise')).rejects.toBeInstanceOf(
      TeamSeatCapReached,
    );
  });

  it('throws when the owner is OVER the cap (defensive — shouldn\'t happen but data drift can occur)', async () => {
    const db = makeCountingDb({ u_owner: 51 });
    await expect(assertCanInvite(db, 'u_owner', 'enterprise')).rejects.toBeInstanceOf(
      TeamSeatCapReached,
    );
  });

  it('respects per-tier cap — a business owner (cap 5) gets locked out at 5, not 50', async () => {
    const db = makeCountingDb({ u_biz: 5 });
    await expect(assertCanInvite(db, 'u_biz', 'business')).rejects.toBeInstanceOf(
      TeamSeatCapReached,
    );
  });

  it('blocks free/pro tiers from inviting at all — those caps are 1 seat (the owner themselves)', async () => {
    const db = makeCountingDb({ u_free: 1 });
    await expect(assertCanInvite(db, 'u_free', 'free')).rejects.toBeInstanceOf(
      TeamSeatCapReached,
    );
    // Even at zero, a free-tier owner with cap 1 should still be allowed
    // their first invite — the cap is "seats including the owner", so
    // we ARE blocking once the seat is filled.
    const dbFresh = makeCountingDb({});
    await expect(assertCanInvite(dbFresh, 'u_free', 'free')).resolves.toBeUndefined();
  });

  it('surfaces the tier + current + limit on the error so the caller can return a friendly 402/409', async () => {
    const db = makeCountingDb({ u_owner: 50 });
    try {
      await assertCanInvite(db, 'u_owner', 'enterprise');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TeamSeatCapReached);
      expect((err as TeamSeatCapReached).tier).toBe('enterprise');
      expect((err as TeamSeatCapReached).current).toBe(50);
      expect((err as TeamSeatCapReached).limit).toBe(50);
    }
  });
});

// ---------------------------------------------------------------------------
// In-memory team_memberships table stub for handler tests. Only handles the
// SQL strings actually used by teams.ts — adding a route requires extending
// this stub. Trade-off: ridiculously simpler than spinning up D1 per test.
// ---------------------------------------------------------------------------

interface MembershipRow {
  owner_user_id: string;
  member_email: string;
  member_user_id: string | null;
  role: 'viewer';
  invite_token: string;
  invited_at: number;
  accepted_at: number | null;
}

function makeMembershipDb(initial: MembershipRow[] = []): { db: D1Database; rows: MembershipRow[] } {
  const rows: MembershipRow[] = [...initial];
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) { bindings = args; return stmt; },
        async first<T = unknown>() {
          if (sql.includes('COUNT(*)')) {
            const [ownerUserId] = bindings as [string];
            const n = rows.filter((r) => r.owner_user_id === ownerUserId).length;
            return { n } as unknown as T;
          }
          if (sql.includes('SELECT invite_token, accepted_at')) {
            const [owner, email] = bindings as [string, string];
            const found = rows.find((r) => r.owner_user_id === owner && r.member_email === email);
            return (found ? { invite_token: found.invite_token, accepted_at: found.accepted_at } : null) as T;
          }
          if (sql.includes('SELECT owner_user_id, member_email, member_user_id, accepted_at')) {
            const [token] = bindings as [string];
            const found = rows.find((r) => r.invite_token === token);
            return (found ? {
              owner_user_id: found.owner_user_id,
              member_email: found.member_email,
              member_user_id: found.member_user_id,
              accepted_at: found.accepted_at,
            } : null) as T;
          }
          return null as T;
        },
        async all<T = unknown>() {
          if (sql.includes('SELECT member_email, member_user_id, role, invited_at, accepted_at')) {
            const [ownerUserId] = bindings as [string];
            const mine = rows
              .filter((r) => r.owner_user_id === ownerUserId)
              .map((r) => ({
                member_email: r.member_email,
                member_user_id: r.member_user_id,
                role: r.role,
                invited_at: r.invited_at,
                accepted_at: r.accepted_at,
              }))
              .sort((a, b) => b.invited_at - a.invited_at);
            return { success: true, results: mine as T[], meta: {} } as unknown as D1Result<T>;
          }
          if (sql.includes('SELECT owner_user_id FROM team_memberships')) {
            const [memberUserId] = bindings as [string];
            const mine = rows
              .filter((r) => r.member_user_id === memberUserId && r.accepted_at !== null)
              .map((r) => ({ owner_user_id: r.owner_user_id }));
            return { success: true, results: mine as T[], meta: {} } as unknown as D1Result<T>;
          }
          return { success: true, results: [] as T[], meta: {} } as unknown as D1Result<T>;
        },
        async run() {
          if (sql.startsWith('INSERT INTO team_memberships')) {
            const [owner, email, token, invitedAt] = bindings as [string, string, string, number];
            rows.push({
              owner_user_id: owner,
              member_email: email,
              member_user_id: null,
              role: 'viewer',
              invite_token: token,
              invited_at: invitedAt,
              accepted_at: null,
            });
            return { success: true, meta: { changes: 1 }, results: [] } as unknown as D1Result;
          }
          if (sql.startsWith('UPDATE team_memberships')) {
            const [memberUserId, acceptedAt, token] = bindings as [string, number, string];
            const row = rows.find((r) => r.invite_token === token);
            if (row) {
              row.member_user_id = memberUserId;
              row.accepted_at = acceptedAt;
              return { success: true, meta: { changes: 1 }, results: [] } as unknown as D1Result;
            }
            return { success: true, meta: { changes: 0 }, results: [] } as unknown as D1Result;
          }
          if (sql.startsWith('DELETE FROM team_memberships')) {
            const [owner, email] = bindings as [string, string];
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i--) {
              if (rows[i].owner_user_id === owner && rows[i].member_email === email) {
                rows.splice(i, 1);
              }
            }
            return { success: true, meta: { changes: before - rows.length }, results: [] } as unknown as D1Result;
          }
          return { success: true, meta: { changes: 0 }, results: [] } as unknown as D1Result;
        },
        async raw() { return []; },
      } as unknown as D1PreparedStatement;
      return stmt;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
  return { db, rows };
}

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [], list_complete: true } as unknown as KVNamespaceListResult<unknown, string>; },
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

/** Stub fetch that handles Clerk user lookups (tier + email) and Resend
 *  invite sends. Adjust the seeded map per test. */
function makeClerkAndResendFetch(opts: {
  users?: Record<string, { tier?: string; email?: string }>;
  resendOk?: boolean;
}): { impl: typeof fetch; resendCalls: Array<{ to: string[]; subject: string }> } {
  const resendCalls: Array<{ to: string[]; subject: string }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url.startsWith('https://api.clerk.com/v1/users/')) {
      const userId = url.replace('https://api.clerk.com/v1/users/', '');
      const seed = opts.users?.[userId];
      if (!seed) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          public_metadata: { tier: seed.tier ?? 'free' },
          primary_email_address_id: 'idem_primary',
          email_addresses: seed.email
            ? [{ id: 'idem_primary', email_address: seed.email }]
            : [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string };
      resendCalls.push({ to: body.to, subject: body.subject });
      if (opts.resendOk === false) {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ id: 'em_test' }), { status: 200 });
    }
    return new Response('unmatched', { status: 500 });
  }) as unknown as typeof fetch;
  return { impl, resendCalls };
}

function makeEnv(db: D1Database, fetchImpl: typeof fetch, resendKey: string | undefined): TeamsEnv {
  return {
    DB: db,
    RATE_LIMIT: makeKv(),
    CLERK_SECRET_KEY: 'sk_test_x',
    RESEND_API_KEY: resendKey,
    fetchImpl: fetchImpl as TeamsEnv['fetchImpl'],
    appBaseUrl: 'https://chefflow.test',
  };
}

describe('fetchUserEmail', () => {
  it('returns the primary email lowercased, or null on missing user', async () => {
    const { impl } = makeClerkAndResendFetch({
      users: { u_alice: { email: 'Alice@Example.COM' } },
    });
    expect(await fetchUserEmail('u_alice', 'sk_x', impl)).toBe('alice@example.com');
    expect(await fetchUserEmail('u_missing', 'sk_x', impl)).toBeNull();
  });
});

describe('handleInvite', () => {
  // Why these tests matter: invite is the one mutating endpoint that
  // touches BOTH the seat cap (tier enforcement) AND the email send.
  // Getting the idempotency wrong leaks duplicate rows (PK violation) or
  // rotates the token while the original email is still in the
  // recipient's inbox. Getting the tier check wrong lets free-tier
  // accounts build out a team for free.

  it('200s, inserts row, sends email when valid email + Enterprise owner under seat cap', async () => {
    const { db, rows } = makeMembershipDb();
    const { impl, resendCalls } = makeClerkAndResendFetch({
      users: { u_owner: { tier: 'enterprise', email: 'owner@kitchen.uk' } },
    });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'sous@kitchen.uk' }),
    });
    const res = await handleInvite(req, env, 'u_owner');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { email: string; token: string; emailStatus: string };
    expect(out.email).toBe('sous@kitchen.uk');
    expect(out.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.emailStatus).toBe('sent');
    expect(rows).toHaveLength(1);
    expect(rows[0].invite_token).toBe(out.token);
    expect(resendCalls[0].to).toEqual(['sous@kitchen.uk']);
  });

  it('400s when body is missing or malformed email (defensive — never insert garbage)', async () => {
    const { db } = makeMembershipDb();
    const { impl } = makeClerkAndResendFetch({ users: { u_owner: { tier: 'enterprise' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const bad = new Request('https://x/api/teams/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect((await handleInvite(bad, env, 'u_owner')).status).toBe(400);
  });

  it('409s when free-tier owner tries to invite (cap = 1 seat = the owner alone)', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_free', member_email: 'a@x', member_user_id: null, role: 'viewer', invite_token: 't', invited_at: 1, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_free: { tier: 'free' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/invite', {
      method: 'POST', body: JSON.stringify({ email: 'second@x.com' }),
    });
    const res = await handleInvite(req, env, 'u_free');
    expect(res.status).toBe(409);
  });

  it('re-inviting the same pending email returns the SAME token (idempotent — no duplicate row, no token rotation invalidating the in-flight email)', async () => {
    const { db, rows } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invite_token: 'tok_original', invited_at: 1, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_owner: { tier: 'enterprise', email: 'owner@k.uk' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/invite', {
      method: 'POST', body: JSON.stringify({ email: 'sous@k.uk' }),
    });
    const res = await handleInvite(req, env, 'u_owner');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { token: string };
    expect(out.token).toBe('tok_original');
    expect(rows).toHaveLength(1); // no duplicate insert
  });

  it('409s when re-inviting an ALREADY-accepted email (chef should remove + re-invite to rotate)', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: 'u_sous', role: 'viewer', invite_token: 't', invited_at: 1, accepted_at: 2 },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_owner: { tier: 'enterprise' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/invite', {
      method: 'POST', body: JSON.stringify({ email: 'sous@k.uk' }),
    });
    expect((await handleInvite(req, env, 'u_owner')).status).toBe(409);
  });

  it('STILL inserts the row when RESEND_API_KEY is unset — the chef can copy the acceptUrl from the response as a fallback', async () => {
    const { db, rows } = makeMembershipDb();
    const { impl, resendCalls } = makeClerkAndResendFetch({ users: { u_owner: { tier: 'enterprise' } } });
    const env = makeEnv(db, impl, undefined);
    const req = new Request('https://x/api/teams/invite', {
      method: 'POST', body: JSON.stringify({ email: 'sous@k.uk' }),
    });
    const res = await handleInvite(req, env, 'u_owner');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { emailStatus: string; acceptUrl: string };
    expect(out.emailStatus).toBe('skipped-no-key');
    expect(out.acceptUrl).toMatch(/^https:\/\/chefflow\.test\/teams\/accept\?token=/);
    expect(rows).toHaveLength(1);
    expect(resendCalls).toHaveLength(0);
  });
});

describe('handleAccept', () => {
  it('200s + stamps row when token matches AND JWT email matches invite email', async () => {
    const { db, rows } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invite_token: 'tok_long_enough_x', invited_at: 1, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_sous: { email: 'sous@k.uk' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/accept', {
      method: 'POST', body: JSON.stringify({ token: 'tok_long_enough_x' }),
    });
    const res = await handleAccept(req, env, 'u_sous');
    expect(res.status).toBe(200);
    expect(rows[0].member_user_id).toBe('u_sous');
    expect(rows[0].accepted_at).toBeGreaterThan(0);
  });

  it('403s when the JWT email does NOT match the invite email — forwarded email cannot be claimed by an attacker account', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invite_token: 'tok_long_enough_x', invited_at: 1, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_attacker: { email: 'attacker@evil.io' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/accept', {
      method: 'POST', body: JSON.stringify({ token: 'tok_long_enough_x' }),
    });
    expect((await handleAccept(req, env, 'u_attacker')).status).toBe(403);
  });

  it('404s when the token does not exist (typo or revoked)', async () => {
    const { db } = makeMembershipDb();
    const { impl } = makeClerkAndResendFetch({ users: { u_x: { email: 'x@y.com' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/accept', {
      method: 'POST', body: JSON.stringify({ token: 'unknown_token' }),
    });
    expect((await handleAccept(req, env, 'u_x')).status).toBe(404);
  });

  it('409s when invite was already accepted by a DIFFERENT user (no seat-claim hijack)', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: 'u_first', role: 'viewer', invite_token: 'tok_long_enough_x', invited_at: 1, accepted_at: 5 },
    ]);
    const { impl } = makeClerkAndResendFetch({ users: { u_second: { email: 'sous@k.uk' } } });
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/accept', {
      method: 'POST', body: JSON.stringify({ token: 'tok_long_enough_x' }),
    });
    expect((await handleAccept(req, env, 'u_second')).status).toBe(409);
  });

  it('400s on missing/empty token in body', async () => {
    const { db } = makeMembershipDb();
    const { impl } = makeClerkAndResendFetch({});
    const env = makeEnv(db, impl, 're_test_long_enough');
    const req = new Request('https://x/api/teams/accept', { method: 'POST', body: JSON.stringify({}) });
    expect((await handleAccept(req, env, 'u_x')).status).toBe(400);
  });
});

describe('handleList', () => {
  it('returns owner\'s memberships sorted by invited_at DESC (most recent first — chef\'s mental model)', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'a@x', member_user_id: null, role: 'viewer', invite_token: 't1', invited_at: 100, accepted_at: null },
      { owner_user_id: 'u_owner', member_email: 'b@x', member_user_id: 'u_b', role: 'viewer', invite_token: 't2', invited_at: 200, accepted_at: 250 },
      { owner_user_id: 'u_other', member_email: 'c@x', member_user_id: null, role: 'viewer', invite_token: 't3', invited_at: 300, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({});
    const env = makeEnv(db, impl, 're_test_long_enough');
    const res = await handleList(env, 'u_owner');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { members: Array<{ member_email: string }> };
    expect(out.members.map((m) => m.member_email)).toEqual(['b@x', 'a@x']);
  });
});

describe('handleDelete', () => {
  it('200s + removes row when (owner, email) match', async () => {
    const { db, rows } = makeMembershipDb([
      { owner_user_id: 'u_owner', member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invite_token: 't', invited_at: 1, accepted_at: null },
    ]);
    const { impl } = makeClerkAndResendFetch({});
    const env = makeEnv(db, impl, 're_test_long_enough');
    expect((await handleDelete('sous@k.uk', env, 'u_owner')).status).toBe(200);
    expect(rows).toHaveLength(0);
  });

  it('404s when no membership matches — chef sees the mismatch instead of a silent no-op', async () => {
    const { db } = makeMembershipDb();
    const { impl } = makeClerkAndResendFetch({});
    const env = makeEnv(db, impl, 're_test_long_enough');
    expect((await handleDelete('ghost@k.uk', env, 'u_owner')).status).toBe(404);
  });
});

describe('handleOwnersOfMe', () => {
  it('returns only the owners the caller has ACCEPTED — pending invites do not count', async () => {
    const { db } = makeMembershipDb([
      { owner_user_id: 'u_owner1', member_email: 'me@x', member_user_id: 'u_me', role: 'viewer', invite_token: 't1', invited_at: 1, accepted_at: 5 },
      { owner_user_id: 'u_owner2', member_email: 'me@x', member_user_id: 'u_me', role: 'viewer', invite_token: 't2', invited_at: 1, accepted_at: null },
      { owner_user_id: 'u_owner3', member_email: 'someoneelse@x', member_user_id: 'u_other', role: 'viewer', invite_token: 't3', invited_at: 1, accepted_at: 10 },
    ]);
    const { impl } = makeClerkAndResendFetch({});
    const env = makeEnv(db, impl, 're_test_long_enough');
    const res = await handleOwnersOfMe(env, 'u_me');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { owners: string[] };
    expect(out.owners).toEqual(['u_owner1']);
  });
});
