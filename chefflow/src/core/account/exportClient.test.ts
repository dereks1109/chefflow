import { describe, it, expect, vi } from 'vitest';
import { exportAccount } from './exportClient';

describe('exportClient.exportAccount', () => {
  it('GETs /api/account/export and returns the parsed JSON', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const payload = {
      userId: 'u_alice',
      exportedAt: 1234,
      schemaVersion: 1,
      tables: { recipes: [], events: [], menus: [], allergen_audits: [] },
      communityRecipes: [],
    };
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as unknown as typeof fetch;

    const out = await exportAccount({
      getToken: async () => 'jwt.test',
      origin: 'https://api.test',
      fetchImpl,
    });
    expect(out).toEqual(payload);
    expect(captured?.url).toBe('https://api.test/api/account/export');
    expect((captured?.init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test');
  });

  it("throws 'Not signed in' if getToken returns null", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      exportAccount({ getToken: async () => null, fetchImpl, origin: 'https://api.test' }),
    ).rejects.toThrow('Not signed in');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws with HTTP status on worker error', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      exportAccount({ getToken: async () => 't', fetchImpl, origin: 'https://api.test' }),
    ).rejects.toThrow('Account export failed: 500');
  });
});
