import { describe, it, expect, vi } from 'vitest';
import { deleteAccount } from './deleteClient';

describe('deleteClient.deleteAccount', () => {
  it('DELETEs /api/account with the Bearer token and returns the cascade summary', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        deleted: { recipes: 5, events: 2, menus: 1, allergen_audits: 0 },
        communityRecipesUnpublished: 1,
        clerkDeleted: true,
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const out = await deleteAccount({
      getToken: async () => 'jwt.test',
      fetchImpl,
      origin: 'https://api.test',
    });
    expect(out.deleted.recipes).toBe(5);
    expect(out.clerkDeleted).toBe(true);
    expect(captured?.url).toBe('https://api.test/api/account');
    expect(captured?.init?.method).toBe('DELETE');
  });

  it("throws 'Not signed in' when getToken returns null", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      deleteAccount({ getToken: async () => null, fetchImpl, origin: 'https://api.test' }),
    ).rejects.toThrow('Not signed in');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws with HTTP status on worker error', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      deleteAccount({ getToken: async () => 't', fetchImpl, origin: 'https://api.test' }),
    ).rejects.toThrow('Account deletion failed: 500');
  });
});
