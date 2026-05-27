import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the contactMail send before importing the module under test so the
// digest runs through a fake transport.
const sendMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./contactMail', () => ({
  sendContactNotification: sendMock,
  MailNotificationError: class extends Error {
    constructor(message: string, public status?: number) {
      super(message);
    }
  },
}));

import { runContactDigest } from './contactDigest';
import type { ContactSubmission } from './contact';

function makeKv(submissions: ContactSubmission[]): KVNamespace {
  const indexEntries = submissions
    .map((s) => ({ id: s.id, createdAt: s.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
  const store = new Map<string, string>();
  store.set('contact:i:byCreatedDesc', JSON.stringify(indexEntries));
  for (const s of submissions) {
    store.set(`contact:s:${s.id}`, JSON.stringify(s));
  }
  return {
    get: async (key: string) => store.get(key) ?? null,
  } as unknown as KVNamespace;
}

function mkSubmission(over: Partial<ContactSubmission>): ContactSubmission {
  return {
    id: 's1',
    name: 'Alice',
    email: 'alice@example.com',
    message: 'Hi',
    ip: '1.2.3.4',
    createdAt: Date.now(),
    ...over,
  };
}

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue(undefined);
});

describe('runContactDigest', () => {
  it('skips the email when there are zero submissions in the 24h window', async () => {
    const now = Date.now();
    const kv = makeKv([mkSubmission({ id: 's_old', createdAt: now - 48 * 3600 * 1000 })]);
    const out = await runContactDigest({ RATE_LIMIT: kv, RESEND_API_KEY: 're_x' }, now);
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-submissions');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends a digest with the submissions in the last 24h', async () => {
    const now = Date.now();
    const kv = makeKv([
      mkSubmission({ id: 'new1', name: 'Bob', createdAt: now - 60_000 }),
      mkSubmission({ id: 'new2', name: 'Carol', createdAt: now - 3600_000 }),
      mkSubmission({ id: 'old',  name: 'Dave',  createdAt: now - 48 * 3600 * 1000 }),
    ]);
    const out = await runContactDigest({ RATE_LIMIT: kv, RESEND_API_KEY: 're_x' }, now);
    expect(out.sent).toBe(true);
    expect(out.windowed).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const allCalls = sendMock.mock.calls as unknown as Array<Array<{
      toAddress?: string;
      subjectOverride?: string;
      htmlBodyOverride?: string;
    }>>;
    const call = allCalls[0]?.[0];
    expect(call).toBeDefined();
    expect(call?.toAddress).toBe('admin@chefflow.uk');
    expect(call?.subjectOverride).toContain('2 contact submissions');
    expect(call?.htmlBodyOverride).toContain('Bob');
    expect(call?.htmlBodyOverride).toContain('Carol');
    expect(call?.htmlBodyOverride).not.toContain('Dave');
  });

  it('skips with no-api-key when RESEND_API_KEY is absent (logs warn, no throw)', async () => {
    const now = Date.now();
    const kv = makeKv([mkSubmission({ createdAt: now })]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runContactDigest({ RATE_LIMIT: kv }, now);
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('no-api-key');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('marks send-failed when the Resend call throws (logs warn, no throw)', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'));
    const now = Date.now();
    const kv = makeKv([mkSubmission({ createdAt: now })]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runContactDigest({ RATE_LIMIT: kv, RESEND_API_KEY: 're_x' }, now);
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('send-failed');
    } finally {
      warn.mockRestore();
    }
  });
});
