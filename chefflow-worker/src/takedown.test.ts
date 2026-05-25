import { describe, it, expect, beforeEach } from 'vitest';
import { submitReport, listReports, resolveReport, TakedownValidationError } from './takedown';
import { publish as communityPublish, get as communityGet } from './community';

// In-memory D1 mock that supports the SQL surface our module uses
// (CREATE / INSERT / SELECT / UPDATE on the takedown_reports table).
// We don't try to be a real SQLite; we just back rows with a Map and
// pattern-match the prepared statements.
function makeFakeDb(): D1Database {
  const rows = new Map<string, Record<string, unknown>>();

  const result = (changes: number) => ({
    success: true,
    meta: { changes, duration: 0, size_after: 0, rows_read: 0, rows_written: changes, last_row_id: 0, changed_db: changes > 0, served_by: 'fake', served_by_region: '', served_by_primary: true },
    results: [],
  } as unknown as D1Result);

  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...args: unknown[]) {
          params = args;
          return stmt;
        },
        async run() {
          if (sql.startsWith('INSERT INTO takedown_reports')) {
            const [id, community_recipe_id, reporter_user_id, reporter_email, reason_code, message, reported_at] = params as [string, string, string, string | null, string, string | null, number];
            rows.set(id, {
              id, community_recipe_id, reporter_user_id, reporter_email,
              reason_code, message, status: 'pending', reported_at,
              resolved_at: null, resolved_by_user_id: null, resolution_note: null,
            });
            return result(1);
          }
          if (sql.startsWith('UPDATE takedown_reports')) {
            const [status, resolved_at, resolved_by_user_id, resolution_note, id] = params as [string, number, string, string | null, string];
            const row = rows.get(id);
            if (!row) return result(0);
            rows.set(id, { ...row, status, resolved_at, resolved_by_user_id, resolution_note });
            return result(1);
          }
          return result(0);
        },
        async first<T = unknown>() {
          if (sql.includes('WHERE id = ?')) {
            const [id] = params as [string];
            return (rows.get(id) ?? null) as T;
          }
          return null;
        },
        async all<T = unknown>() {
          let list = Array.from(rows.values());
          if (sql.includes('WHERE status = ?')) {
            const [status] = params as [string];
            list = list.filter((r) => r.status === status);
          }
          list.sort((a, b) => (b.reported_at as number) - (a.reported_at as number));
          // Limit is the last bound param (number).
          const limit = params[params.length - 1] as number;
          return { success: true, results: list.slice(0, limit) as T[], meta: {} } as unknown as D1Result<T>;
        },
        async raw() { return [] as unknown[]; },
      } as unknown as D1PreparedStatement;
      return stmt;
    },
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function makeFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}) {
      const keys = Array.from(store.keys())
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cacheStatus: null, cursor } as unknown as KVNamespaceListResult<unknown, string>;
    },
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

describe('takedown.submitReport', () => {
  let db: D1Database;
  beforeEach(() => {
    db = makeFakeDb();
  });

  it('persists a report with status=pending and returns its id', async () => {
    const out = await submitReport(db, 'user_alice', {
      communityRecipeId: 'cr_xyz',
      reasonCode: 'copyright',
      message: 'This is my copyrighted recipe',
      reporterEmail: 'rights@example.com',
    }, 1000);
    expect(out.id).toMatch(/^tdr_/);

    const list = await listReports(db, { status: 'pending' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      community_recipe_id: 'cr_xyz',
      reporter_user_id: 'user_alice',
      reporter_email: 'rights@example.com',
      reason_code: 'copyright',
      message: 'This is my copyrighted recipe',
      status: 'pending',
    });
  });

  it('rejects an unknown reasonCode', async () => {
    await expect(
      submitReport(db, 'user_alice', {
        communityRecipeId: 'cr_xyz',
        // @ts-expect-error testing runtime guard
        reasonCode: 'not_a_reason',
      }),
    ).rejects.toBeInstanceOf(TakedownValidationError);
  });

  it('rejects an empty communityRecipeId', async () => {
    await expect(
      submitReport(db, 'user_alice', {
        communityRecipeId: '',
        reasonCode: 'copyright',
      }),
    ).rejects.toBeInstanceOf(TakedownValidationError);
  });
});

describe('takedown.resolveReport', () => {
  it('unpublishes the recipe and marks the report resolved on action=unpublish', async () => {
    const db = makeFakeDb();
    const kv = makeFakeKv();
    // Seed a community recipe to unpublish.
    const { id: recipeId } = await communityPublish(kv, 'user_author', 'Alice', {
      id: 'r_local',
      title: 'Test',
      originalYield: 1,
      ingredients: [],
      steps: [],
    } as never, 500);
    expect(await communityGet(kv, recipeId)).not.toBeNull();

    const { id: reportId } = await submitReport(db, 'user_reporter', {
      communityRecipeId: recipeId,
      reasonCode: 'copyright',
    }, 600);

    const out = await resolveReport(db, kv, 'user_admin', reportId, 'unpublish', 'verified IP claim', 700);
    expect(out.status).toBe('resolved');
    expect(out.unpublishedRecipeId).toBe(recipeId);
    expect(await communityGet(kv, recipeId)).toBeNull();

    const list = await listReports(db, { status: 'resolved' });
    expect(list).toHaveLength(1);
    expect(list[0].resolved_by_user_id).toBe('user_admin');
    expect(list[0].resolution_note).toBe('verified IP claim');
  });

  it('marks resolved even when the recipe was already deleted', async () => {
    const db = makeFakeDb();
    const kv = makeFakeKv();
    const { id: reportId } = await submitReport(db, 'user_reporter', {
      communityRecipeId: 'cr_already_gone',
      reasonCode: 'copyright',
    });
    const out = await resolveReport(db, kv, 'user_admin', reportId, 'unpublish', null);
    expect(out.status).toBe('resolved');
    expect(out.unpublishedRecipeId).toBeNull();
  });

  it('marks dismissed on action=dismiss (no unpublish)', async () => {
    const db = makeFakeDb();
    const kv = makeFakeKv();
    const { id: recipeId } = await communityPublish(kv, 'user_author', 'Alice', {
      id: 'r_local',
      title: 'Test',
      originalYield: 1,
      ingredients: [],
      steps: [],
    } as never);
    const { id: reportId } = await submitReport(db, 'user_reporter', {
      communityRecipeId: recipeId,
      reasonCode: 'spam',
    });
    const out = await resolveReport(db, kv, 'user_admin', reportId, 'dismiss', 'not infringing');
    expect(out.status).toBe('dismissed');
    expect(out.unpublishedRecipeId).toBeNull();
    expect(await communityGet(kv, recipeId)).not.toBeNull();
  });

  it('refuses to re-resolve an already-resolved report', async () => {
    const db = makeFakeDb();
    const kv = makeFakeKv();
    const { id: reportId } = await submitReport(db, 'user_reporter', {
      communityRecipeId: 'cr_x',
      reasonCode: 'spam',
    });
    await resolveReport(db, kv, 'user_admin', reportId, 'dismiss', null);
    await expect(
      resolveReport(db, kv, 'user_admin', reportId, 'dismiss', null),
    ).rejects.toBeInstanceOf(TakedownValidationError);
  });
});
