import { describe, it, expect, vi } from 'vitest';
import { provisionDemos } from './provisionClient';

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('provisionDemos', () => {
  it('POSTs to /api/demos/provision with the injected Bearer token', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({ alreadyProvisioned: false, recipesInserted: 15, eventsInserted: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const out = await provisionDemos({
      getToken: async () => 'jwt.test.token',
      fetchImpl,
      origin: 'https://api.test',
    });

    expect(out).toEqual({ alreadyProvisioned: false, recipesInserted: 15, eventsInserted: 1 });
    expect(capturedUrl).toBe('https://api.test/api/demos/provision');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test.token');
  });

  it("throws 'Not signed in' when getToken returns null (Clerk session not ready)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      provisionDemos({
        getToken: async () => null,
        fetchImpl,
        origin: 'https://api.test',
      }),
    ).rejects.toThrow('Not signed in');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws with the HTTP status when worker rejects', async () => {
    await expect(
      provisionDemos({
        getToken: async () => 'jwt.test.token',
        fetchImpl: fetchReturning(401, { error: 'unauthorized' }),
        origin: 'https://api.test',
      }),
    ).rejects.toThrow('Demo provision failed: 401');
  });

  it('returns no-op result when VITE_E2E_MODE is set, without calling getToken or fetch', async () => {
    const originalEnv = import.meta.env.VITE_E2E_MODE;
    (import.meta.env as Record<string, string | undefined>).VITE_E2E_MODE = 'true';
    try {
      const getToken = vi.fn(async () => 'jwt.test.token');
      const fetchImpl = vi.fn() as unknown as typeof fetch;
      const out = await provisionDemos({ getToken, fetchImpl });
      expect(out).toEqual({ alreadyProvisioned: true, recipesInserted: 0, eventsInserted: 0 });
      expect(getToken).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as Record<string, string | undefined>).VITE_E2E_MODE = originalEnv;
    }
  });
});
