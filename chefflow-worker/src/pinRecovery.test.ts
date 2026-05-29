import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the email transport so happy-path tests don't try to hit Resend.
const sendMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./contactMail', () => ({
  sendContactNotification: sendMock,
  MailNotificationError: class extends Error {
    constructor(message: string, public status?: number) { super(message); }
  },
}));

import {
  requestPinRecoveryCode,
  verifyPinRecoveryCode,
  type PinRecoveryEnv,
  type FetchLike,
} from './pinRecovery';

// In-memory KV that honours expirationTtl just enough for these tests
// (we never actually advance time inside KV — we only assert that the
// blob is written and readable).
function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
  } as unknown as KVNamespace;
}

function makeEnv(over: Partial<PinRecoveryEnv> = {}): PinRecoveryEnv {
  return {
    RATE_LIMIT: makeKv(),
    CLERK_SECRET_KEY: 'sk_test_x',
    RESEND_API_KEY: 're_x',
    ...over,
  };
}

function clerkFetch(email: string | null): FetchLike {
  return vi.fn(async () => new Response(
    JSON.stringify({
      id: 'user_a',
      email_addresses: email ? [{ id: 'em_1', email_address: email }] : [],
      primary_email_address_id: email ? 'em_1' : undefined,
    }),
    { status: 200 },
  ));
}

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue(undefined);
});

describe('requestPinRecoveryCode', () => {
  it('skips with no-clerk-secret when CLERK_SECRET_KEY is unset', async () => {
    const out = await requestPinRecoveryCode(
      makeEnv({ CLERK_SECRET_KEY: undefined }),
      'user_a',
      clerkFetch('chef@example.com'),
    );
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-clerk-secret');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips with no-email-on-clerk when the user has no email on file', async () => {
    const out = await requestPinRecoveryCode(makeEnv(), 'user_a', clerkFetch(null));
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-email-on-clerk');
  });

  it('sends the email + writes the code blob to KV under pinrecov:code:{userId}', async () => {
    const env = makeEnv();
    const out = await requestPinRecoveryCode(env, 'user_a', clerkFetch('chef@example.com'));
    expect(out.sent).toBe(true);
    // Mail dispatched with the recovery subject + a 6-digit code in the body.
    expect(sendMock).toHaveBeenCalledTimes(1);
    const allCalls = sendMock.mock.calls as unknown as Array<Array<{
      subjectOverride?: string;
      htmlBodyOverride?: string;
      toAddress?: string;
    }>>;
    const call = allCalls[0]?.[0] ?? {};
    expect(call.subjectOverride).toContain('PIN recovery code');
    expect(call.toAddress).toBe('chef@example.com');
    expect(call.htmlBodyOverride).toMatch(/\d{6}/);
    // KV blob stored under the expected key.
    const blob = await env.RATE_LIMIT.get('pinrecov:code:user_a');
    expect(blob).not.toBeNull();
    const parsed = JSON.parse(blob!);
    expect(parsed.code).toMatch(/^\d{6}$/);
    expect(typeof parsed.expiresAt).toBe('number');
    // emailHint masks the local part — never returns the full address.
    expect(out.emailHint).toMatch(/^ch.+@example\.com$/);
    expect(out.emailHint).not.toContain('chef@');
  });

  it('rate-limits after MAX_SENDS_PER_WINDOW (3) sends per user', async () => {
    const env = makeEnv();
    const fetchImpl = clerkFetch('chef@example.com');
    // Three sends succeed; the fourth bumps the counter to 4 and is denied.
    await requestPinRecoveryCode(env, 'user_a', fetchImpl);
    await requestPinRecoveryCode(env, 'user_a', fetchImpl);
    await requestPinRecoveryCode(env, 'user_a', fetchImpl);
    const fourth = await requestPinRecoveryCode(env, 'user_a', fetchImpl);
    expect(fourth.sent).toBe(false);
    expect(fourth.skipReason).toBe('rate-limited');
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('marks send-failed when the Resend POST throws (logs warn, no exception)', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await requestPinRecoveryCode(makeEnv(), 'user_a', clerkFetch('chef@example.com'));
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('send-failed');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('verifyPinRecoveryCode', () => {
  it('returns ok=true on a matching code AND burns the KV entry (single use)', async () => {
    const env = makeEnv();
    const out1 = await requestPinRecoveryCode(env, 'user_a', clerkFetch('chef@example.com'));
    expect(out1.sent).toBe(true);
    const blob = JSON.parse((await env.RATE_LIMIT.get('pinrecov:code:user_a'))!);
    const out = await verifyPinRecoveryCode(env, 'user_a', blob.code);
    expect(out.ok).toBe(true);
    expect(out.reason).toBeUndefined();
    // Single-use: the key is gone.
    expect(await env.RATE_LIMIT.get('pinrecov:code:user_a')).toBeNull();
  });

  it('returns wrong-code when the supplied digits do not match', async () => {
    const env = makeEnv();
    await requestPinRecoveryCode(env, 'user_a', clerkFetch('chef@example.com'));
    const out = await verifyPinRecoveryCode(env, 'user_a', '000000');
    // The chance the random code WAS 000000 is 1-in-a-million; assume
    // not. Worst case the test is flaky once a year.
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('wrong-code');
  });

  it('returns no-code when there is no outstanding KV entry (user never requested)', async () => {
    const env = makeEnv();
    const out = await verifyPinRecoveryCode(env, 'user_a', '123456');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no-code');
  });

  it('rejects non-6-digit input as wrong-code (constant-time-ish, no KV read either)', async () => {
    const env = makeEnv();
    await requestPinRecoveryCode(env, 'user_a', clerkFetch('chef@example.com'));
    for (const bad of ['', '12345', '1234567', 'abc123', '12345a']) {
      const out = await verifyPinRecoveryCode(env, 'user_a', bad);
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('wrong-code');
    }
  });
});
