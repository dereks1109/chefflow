import { describe, it, expect, vi } from 'vitest';
import { completeOnboarding, OnboardingError } from './onboarding';

function fetchReturning(status: number, body: unknown = ''): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('completeOnboarding', () => {
  it('PATCHes Clerk /metadata with the merge endpoint + profile slice on happy path', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const out = await completeOnboarding(
      'user_alice',
      'sk_test_x',
      { displayName: 'Alice', showNameOnCommunity: true },
      fetchImpl,
    );

    expect(out).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://api.clerk.com/v1/users/user_alice/metadata');
    expect(capturedInit?.method).toBe('PATCH');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      public_metadata: {
        onboardingComplete: true,
        profile: { displayName: 'Alice', showNameOnCommunity: true },
      },
    });
  });

  it('omits profile slice when skip path sends empty body', async () => {
    let captured: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await completeOnboarding('user_alice', 'sk_test_x', {}, fetchImpl);

    expect(captured).toEqual({ public_metadata: { onboardingComplete: true } });
  });

  it('trims displayName whitespace; drops empty-string displayName', async () => {
    let captured: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await completeOnboarding('user_alice', 'sk_test_x', { displayName: '  ' }, fetchImpl);
    expect(captured).toEqual({ public_metadata: { onboardingComplete: true } });

    await completeOnboarding('user_alice', 'sk_test_x', { displayName: '  Bob  ' }, fetchImpl);
    expect(captured).toEqual({
      public_metadata: { onboardingComplete: true, profile: { displayName: 'Bob' } },
    });
  });

  it('throws OnboardingError with the HTTP status when Clerk rejects', async () => {
    const fetchImpl = fetchReturning(403, 'forbidden');
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', {}, fetchImpl),
    ).rejects.toBeInstanceOf(OnboardingError);
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', {}, fetchImpl),
    ).rejects.toMatchObject({ status: 403 });
  });
});
