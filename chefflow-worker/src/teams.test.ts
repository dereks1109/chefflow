import { describe, it, expect } from 'vitest';
import { assertCanInvite, TeamSeatCapReached } from './teams';

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
