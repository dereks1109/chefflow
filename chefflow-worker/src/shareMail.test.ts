import { describe, it, expect, vi } from 'vitest';
import { notifyTeamOnShare } from './shareMail';
import type { ShareNotificationContext } from './sync';

// Builds a minimal D1Database stub with seeded team_memberships rows.
// Only the SELECT shape sync.ts/shareMail.ts use is implemented — every
// other prepared-statement call returns an empty result.
function makeDb(memberships: Array<{ group_id: string; member_email: string; member_user_id: string | null; accepted_at: number | null }>) {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) { bound = args; return this; },
        async all<T>() {
          if (sql.includes('FROM team_memberships') && sql.includes('group_id') && sql.includes('accepted_at IS NOT NULL')) {
            const [groupId] = bound as [string];
            const results = memberships
              .filter((m) => m.group_id === groupId && m.accepted_at !== null)
              .map((m) => ({ member_email: m.member_email, member_user_id: m.member_user_id }));
            return { results, success: true } as T;
          }
          return { results: [], success: true } as T;
        },
        async first<T>() { return null as T; },
        async run() { return { success: true }; },
      };
    },
  } as unknown as D1Database;
}

function makeCtx(overrides: Partial<ShareNotificationContext> = {}): ShareNotificationContext {
  return {
    table: 'recipes',
    rowId: 'r1',
    ownerUserId: 'user_owner',
    addedGroupIds: ['grp_a'],
    newPayload: JSON.stringify({ id: 'r1', title: 'Lemon tart' }),
    ...overrides,
  };
}

function okResponse() {
  return new Response(JSON.stringify({ id: 'resend_msg_1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shareMail.notifyTeamOnShare', () => {
  it('sends one Resend email per accepted member of the newly-added group', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
      { group_id: 'grp_a', member_email: 'bob@example.com',   member_user_id: 'user_bob',   accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({ db, ctx: makeCtx(), apiKey: 'rs_test', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const recipients = calls.map((c) => JSON.parse(c[1].body).to[0]);
    expect(recipients.sort()).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('skips the owner who initiated the share (no self-notification)', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'owner@example.com', member_user_id: 'user_owner', accepted_at: 1 },
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({ db, ctx: makeCtx(), apiKey: 'rs_test', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body).to[0]).toBe('alice@example.com');
  });

  it('deduplicates: a member in TWO newly-added groups receives ONE email', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
      { group_id: 'grp_b', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({ db, ctx: makeCtx({ addedGroupIds: ['grp_a', 'grp_b'] }), apiKey: 'rs_test', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pending invites (accepted_at NULL) → not emailed', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
      { group_id: 'grp_a', member_email: 'pending@example.com', member_user_id: null, accepted_at: null },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({ db, ctx: makeCtx(), apiKey: 'rs_test', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body).to[0]).toBe('alice@example.com');
  });

  it('subject + body include the item title and a deep link to the recipe', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({
      db,
      ctx: makeCtx({ rowId: 'r_demo_42', newPayload: JSON.stringify({ id: 'r_demo_42', title: 'Lemon tart' }) }),
      apiKey: 'rs_test',
      ownerDisplayName: 'Priscilla Morgan',
      fetchImpl,
    });
    const body = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.subject).toBe('Priscilla Morgan shared a recipe with your team');
    expect(body.text).toContain('Lemon tart');
    expect(body.text).toContain('https://chefflow.uk/recipes/r_demo_42');
    expect(body.html).toContain('https://chefflow.uk/recipes/r_demo_42');
    expect(body.from).toBe('ChefFlow Teams <noreply@chefflow.uk>');
  });

  it('event share routes the deep link to /events/, not /recipes/', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    await notifyTeamOnShare({
      db,
      ctx: makeCtx({ table: 'events', rowId: 'e_42', newPayload: JSON.stringify({ id: 'e_42', title: 'Birthday dinner' }) }),
      apiKey: 'rs_test',
      fetchImpl,
    });
    const body = JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.subject).toBe('A teammate shared a event with your team');
    expect(body.text).toContain('https://chefflow.uk/events/e_42');
  });

  it('no apiKey → no-op (warns but does not throw)', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
    ]);
    const fetchImpl = vi.fn(() => Promise.resolve(okResponse())) as unknown as typeof fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await notifyTeamOnShare({ db, ctx: makeCtx(), apiKey: undefined, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Resend 500 for one recipient does NOT abort sends to remaining recipients', async () => {
    const db = makeDb([
      { group_id: 'grp_a', member_email: 'alice@example.com', member_user_id: 'user_alice', accepted_at: 1 },
      { group_id: 'grp_a', member_email: 'bob@example.com',   member_user_id: 'user_bob',   accepted_at: 1 },
    ]);
    let call = 0;
    const fetchImpl = vi.fn(() => {
      call++;
      return Promise.resolve(call === 1
        ? new Response('Internal error', { status: 500 })
        : okResponse());
    }) as unknown as typeof fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await notifyTeamOnShare({ db, ctx: makeCtx(), apiKey: 'rs_test', fetchImpl });
    // Both recipients attempted, only the first failed.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
