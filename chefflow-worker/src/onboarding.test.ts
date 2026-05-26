import { describe, it, expect, vi } from 'vitest';
import { completeOnboarding, OnboardingError, type OnboardingProfile } from './onboarding';

function fetchReturning(status: number, body: unknown = ''): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

// Every test fills these three because the handler now rejects without them.
const TOS: Required<Pick<OnboardingProfile, 'tosAcceptedAt' | 'tosVersion' | 'disclaimerVersion'>> = {
  tosAcceptedAt: '2026-05-26T10:00:00.000Z',
  tosVersion: '2026-05-26',
  disclaimerVersion: '2026-05-26',
};

function fakeDb(): { db: D1Database; binds: unknown[][]; runs: number; throwOnce: boolean } {
  const binds: unknown[][] = [];
  let throwOnce = false;
  let runs = 0;
  const prepared = {
    bind(...args: unknown[]) {
      binds.push(args);
      return this;
    },
    async run() {
      runs += 1;
      if (throwOnce) {
        throwOnce = false;
        throw new Error('D1 unavailable');
      }
      return { success: true };
    },
  } as unknown as D1PreparedStatement;
  const db = {
    prepare: vi.fn(() => prepared),
  } as unknown as D1Database;
  const state = { db, binds, get runs() { return runs; }, get throwOnce() { return throwOnce; }, set throwOnce(v: boolean) { throwOnce = v; } };
  return state as { db: D1Database; binds: unknown[][]; runs: number; throwOnce: boolean };
}

describe('completeOnboarding', () => {
  it('PATCHes Clerk /metadata with the merge endpoint + profile slice + ToS fields on happy path', async () => {
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
      { ...TOS, displayName: 'Alice', showNameOnCommunity: true },
      fetchImpl,
    );

    expect(out).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://api.clerk.com/v1/users/user_alice/metadata');
    expect(capturedInit?.method).toBe('PATCH');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      public_metadata: {
        onboardingComplete: true,
        tosAcceptedAt: TOS.tosAcceptedAt,
        tosVersion: TOS.tosVersion,
        disclaimerVersion: TOS.disclaimerVersion,
        profile: { displayName: 'Alice', showNameOnCommunity: true },
      },
    });
  });

  it('omits profile slice when skip path sends no profile fields (ToS still required)', async () => {
    let captured: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await completeOnboarding('user_alice', 'sk_test_x', TOS, fetchImpl);

    expect(captured).toEqual({
      public_metadata: {
        onboardingComplete: true,
        tosAcceptedAt: TOS.tosAcceptedAt,
        tosVersion: TOS.tosVersion,
        disclaimerVersion: TOS.disclaimerVersion,
      },
    });
  });

  it('trims displayName whitespace; drops empty-string displayName', async () => {
    let captured: { public_metadata: { profile?: { displayName?: string } } } | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await completeOnboarding('user_alice', 'sk_test_x', { ...TOS, displayName: '  ' }, fetchImpl);
    expect(captured?.public_metadata.profile).toBeUndefined();

    await completeOnboarding('user_alice', 'sk_test_x', { ...TOS, displayName: '  Bob  ' }, fetchImpl);
    expect(captured?.public_metadata.profile).toEqual({ displayName: 'Bob' });
  });

  it('rejects when tosAcceptedAt / tosVersion / disclaimerVersion is missing', async () => {
    const fetchImpl = fetchReturning(200, '{}');
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', {}, fetchImpl),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', { tosAcceptedAt: TOS.tosAcceptedAt }, fetchImpl),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws OnboardingError with the HTTP status when Clerk rejects', async () => {
    const fetchImpl = fetchReturning(403, 'forbidden');
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', TOS, fetchImpl),
    ).rejects.toBeInstanceOf(OnboardingError);
    await expect(
      completeOnboarding('user_alice', 'sk_test_x', TOS, fetchImpl),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('writes a tos_acceptances row to D1 when db is provided + Clerk PATCH succeeds', async () => {
    const fetchImpl = fetchReturning(200, '{}');
    const state = fakeDb();

    await completeOnboarding(
      'user_alice',
      'sk_test_x',
      TOS,
      fetchImpl,
      {
        db: state.db,
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 chef',
        idGen: () => 'tos-id-fixed',
      },
    );

    expect(state.binds).toHaveLength(1);
    expect(state.binds[0]).toEqual([
      'tos-id-fixed',
      'user_alice',
      Date.parse(TOS.tosAcceptedAt),
      TOS.tosVersion,
      TOS.disclaimerVersion,
      '203.0.113.7',
      'Mozilla/5.0 chef',
    ]);
  });

  it('still returns ok when D1 insert fails (Clerk metadata is the runtime gate)', async () => {
    const fetchImpl = fetchReturning(200, '{}');
    const state = fakeDb();
    state.throwOnce = true;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await completeOnboarding(
        'user_alice',
        'sk_test_x',
        TOS,
        fetchImpl,
        { db: state.db, idGen: () => 'tos-id-fixed' },
      );
      expect(out).toEqual({ ok: true });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
