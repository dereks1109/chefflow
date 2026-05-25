import { describe, it, expect, vi } from 'vitest';
import { completeOnboarding } from './onboardingClient';

function fetchReturning(status: number): typeof fetch {
  return vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
}

describe('completeOnboarding (client)', () => {
  it('POSTs to /api/onboarding/complete with the injected Bearer token + form fields as JSON', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const out = await completeOnboarding({
      getToken: async () => 'jwt.test',
      fields: { displayName: 'Alice', showNameOnCommunity: true },
      fetchImpl,
      origin: 'https://api.test',
    });

    expect(out).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://api.test/api/onboarding/complete');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      displayName: 'Alice',
      showNameOnCommunity: true,
    });
  });

  it("throws 'Not signed in' when getToken returns null", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      completeOnboarding({
        getToken: async () => null,
        fields: {},
        fetchImpl,
        origin: 'https://api.test',
      }),
    ).rejects.toThrow('Not signed in');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws with HTTP status when worker rejects', async () => {
    await expect(
      completeOnboarding({
        getToken: async () => 'jwt.test',
        fields: {},
        fetchImpl: fetchReturning(500),
        origin: 'https://api.test',
      }),
    ).rejects.toThrow('Onboarding completion failed: 500');
  });

  it('short-circuits to ok in VITE_E2E_MODE (no fetch, no token)', async () => {
    const originalEnv = import.meta.env.VITE_E2E_MODE;
    (import.meta.env as Record<string, string | undefined>).VITE_E2E_MODE = 'true';
    try {
      const getToken = vi.fn(async () => 'jwt.test');
      const fetchImpl = vi.fn() as unknown as typeof fetch;
      const out = await completeOnboarding({ getToken, fields: {}, fetchImpl });
      expect(out).toEqual({ ok: true });
      expect(getToken).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as Record<string, string | undefined>).VITE_E2E_MODE = originalEnv;
    }
  });
});
