import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be hoisted before module imports.
const sendMock = vi.hoisted(() => vi.fn(async () => undefined));
const runAiMock = vi.hoisted(() => vi.fn(async () => ''));
const getAccessTokenMock = vi.hoisted(() => vi.fn(async () => 'access-token'));
const listMessageIdsMock = vi.hoisted(() => vi.fn(async () => [] as Array<{ id: string; threadId: string }>));
const getMessageMock = vi.hoisted(() => vi.fn(async (_t: string, id: string) => ({
  id,
  threadId: id,
  snippet: `snippet ${id}`,
  from: 'sam@example.com',
  subject: `subj ${id}`,
})));

vi.mock('./contactMail', () => ({
  sendContactNotification: sendMock,
  MailNotificationError: class extends Error {
    constructor(message: string, public status?: number) { super(message); }
  },
}));
vi.mock('./aiCall', () => ({ runAi: runAiMock }));
vi.mock('./gmail', () => ({
  getAccessToken: getAccessTokenMock,
  listMessageIds: listMessageIdsMock,
  getMessage: getMessageMock,
  GmailError: class extends Error {
    constructor(message: string, public status?: number) { super(message); }
  },
}));

import { runDailyDigest } from './dailyDigest';
import type { ContactSubmission } from './contact';

const FAKE_AI = {} as Ai;

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

function baseEnv(over: Partial<Parameters<typeof runDailyDigest>[0]> = {}): Parameters<typeof runDailyDigest>[0] {
  return {
    AI: FAKE_AI,
    RATE_LIMIT: makeKv([]),
    RESEND_API_KEY: 're_x',
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
    ...over,
  };
}

function lastSendCall() {
  const allCalls = sendMock.mock.calls as unknown as Array<Array<{
    toAddress?: string;
    fromAddress?: string;
    subjectOverride?: string;
    htmlBodyOverride?: string;
    textBodyOverride?: string;
  }>>;
  return allCalls[allCalls.length - 1]?.[0];
}

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue(undefined);
  runAiMock.mockClear();
  runAiMock.mockResolvedValue('');
  getAccessTokenMock.mockClear();
  getAccessTokenMock.mockResolvedValue('access-token');
  listMessageIdsMock.mockClear();
  listMessageIdsMock.mockResolvedValue([]);
  getMessageMock.mockClear();
});

describe('runDailyDigest', () => {
  it('skips the email entirely on a quiet day (no emails AND no submissions)', async () => {
    // Both sides return empty success-state, not failure. That's the only
    // condition we treat as "no noise" — failure modes always send so
    // the chef notices.
    listMessageIdsMock.mockResolvedValueOnce([]);
    const out = await runDailyDigest(baseEnv({ RATE_LIMIT: makeKv([]) }));
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('quiet-day');
    expect(out.gmail).toBe('no-messages');
    expect(out.contact).toBe('no-submissions');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends ONE combined email with both sections on the happy path', async () => {
    const now = Date.now();
    listMessageIdsMock.mockResolvedValueOnce([{ id: 'm1', threadId: 't1' }]);
    runAiMock.mockResolvedValueOnce(JSON.stringify({
      items: [{ priority: 1, oneLine: 'Sam confirms event Saturday', from: 'sam@example.com', subject: 'Event confirm' }],
    }));
    const env = baseEnv({
      RATE_LIMIT: makeKv([mkSubmission({ id: 'new1', name: 'Bob', createdAt: now - 60_000 })]),
    });
    const out = await runDailyDigest(env, now);

    expect(out.sent).toBe(true);
    expect(out.gmail).toBe('ok');
    expect(out.contact).toBe('ok');
    expect(out.gmailItems).toBe(1);
    expect(out.contactCount).toBe(1);
    // Exactly ONE email — that's the whole point of the combine.
    expect(sendMock).toHaveBeenCalledTimes(1);

    const call = lastSendCall();
    expect(call?.toAddress).toBe('admin@chefflow.uk');
    expect(call?.subjectOverride).toContain('1 email');
    expect(call?.subjectOverride).toContain('1 submission');
    // Both sections present in the same body.
    expect(call?.htmlBodyOverride).toContain('Sam confirms');
    expect(call?.htmlBodyOverride).toContain('Bob');
  });

  it('still sends when inbox has items but contact side is empty — contact placeholder shown', async () => {
    listMessageIdsMock.mockResolvedValueOnce([{ id: 'm1', threadId: 't1' }]);
    runAiMock.mockResolvedValueOnce(JSON.stringify({
      items: [{ priority: 2, oneLine: 'Reminder: invoice due', from: 'acme', subject: 'Invoice' }],
    }));
    const out = await runDailyDigest(baseEnv({ RATE_LIMIT: makeKv([]) }));
    expect(out.sent).toBe(true);
    expect(out.gmail).toBe('ok');
    expect(out.contact).toBe('no-submissions');

    const call = lastSendCall();
    expect(call?.htmlBodyOverride).toContain('Reminder: invoice due');
    // Placeholder copy makes it obvious the cron ran AND why contact side is empty.
    expect(call?.htmlBodyOverride).toContain('No new contact form submissions');
  });

  it('still sends when contact side has submissions but Gmail upstream fails — inbox placeholder shown', async () => {
    // Gmail-side OAuth secrets missing → no-secrets failure, but
    // contact side still has content, so we MUST send.
    const now = Date.now();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runDailyDigest(baseEnv({
        GOOGLE_OAUTH_REFRESH_TOKEN: undefined,
        RATE_LIMIT: makeKv([mkSubmission({ id: 'new1', name: 'Bob', createdAt: now - 60_000 })]),
      }), now);
      expect(out.sent).toBe(true);
      expect(out.gmail).toBe('no-secrets');
      expect(out.contact).toBe('ok');

      const call = lastSendCall();
      expect(call?.htmlBodyOverride).toContain('Bob');
      // Surface the broken side so the chef notices.
      expect(call?.htmlBodyOverride).toContain('Gmail OAuth secrets not configured');
      expect(call?.subjectOverride).toContain('inbox unavailable');
    } finally {
      warn.mockRestore();
    }
  });

  it('skips with no-api-key when Resend key missing — never mocks the send', async () => {
    listMessageIdsMock.mockResolvedValueOnce([{ id: 'm1', threadId: 't1' }]);
    runAiMock.mockResolvedValueOnce(JSON.stringify({ items: [{ priority: 1, oneLine: 'x' }] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runDailyDigest(baseEnv({ RESEND_API_KEY: undefined }));
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('no-api-key');
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('marks send-failed when Resend POST throws (still returns the rendered counts)', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'));
    listMessageIdsMock.mockResolvedValueOnce([{ id: 'm1', threadId: 't1' }]);
    runAiMock.mockResolvedValueOnce(JSON.stringify({ items: [{ priority: 3, oneLine: 'hi' }] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runDailyDigest(baseEnv({ RATE_LIMIT: makeKv([]) }));
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('send-failed');
      // Counts are preserved across the send failure for log line readability.
      expect(out.gmailItems).toBe(1);
      expect(out.gmail).toBe('ok');
    } finally {
      warn.mockRestore();
    }
  });
});
