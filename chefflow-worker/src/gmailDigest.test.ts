import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    constructor(message: string, public status?: number) {
      super(message);
    }
  },
}));
vi.mock('./aiCall', () => ({
  runAi: runAiMock,
}));
vi.mock('./gmail', () => ({
  getAccessToken: getAccessTokenMock,
  listMessageIds: listMessageIdsMock,
  getMessage: getMessageMock,
  GmailError: class extends Error {
    constructor(message: string, public status?: number) { super(message); }
  },
}));

import { runGmailDigest } from './gmailDigest';

const FAKE_AI = {} as Ai;

function envWithSecrets(over: Partial<Parameters<typeof runGmailDigest>[0]> = {}): Parameters<typeof runGmailDigest>[0] {
  return {
    AI: FAKE_AI,
    RESEND_API_KEY: 're_x',
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
    ...over,
  };
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

describe('runGmailDigest', () => {
  it('skips with no-secrets when OAuth secrets missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runGmailDigest(envWithSecrets({ GOOGLE_OAUTH_REFRESH_TOKEN: undefined }));
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('no-secrets');
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('skips with no-api-key when Resend key missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runGmailDigest(envWithSecrets({ RESEND_API_KEY: undefined }));
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('no-api-key');
    } finally {
      warn.mockRestore();
    }
  });

  it('skips with no-messages when Gmail returns an empty list', async () => {
    listMessageIdsMock.mockResolvedValueOnce([]);
    const out = await runGmailDigest(envWithSecrets());
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-messages');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips with llm-failed when the digest JSON is unparseable', async () => {
    listMessageIdsMock.mockResolvedValueOnce([
      { id: 'm1', threadId: 't1' },
    ]);
    runAiMock.mockResolvedValueOnce('not json {');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await runGmailDigest(envWithSecrets());
      expect(out.fetched).toBe(1);
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('llm-failed');
    } finally {
      warn.mockRestore();
    }
  });

  it('sends a priority-grouped digest on happy path', async () => {
    listMessageIdsMock.mockResolvedValueOnce([
      { id: 'm1', threadId: 't1' },
      { id: 'm2', threadId: 't2' },
    ]);
    runAiMock.mockResolvedValueOnce(JSON.stringify({
      items: [
        { priority: 1, oneLine: 'Sam confirms event Saturday', from: 'sam@example.com', subject: 'Event confirm' },
        { priority: 5, oneLine: 'Marketing blast from acme.com', from: 'acme', subject: 'Newsletter' },
      ],
    }));
    const out = await runGmailDigest(envWithSecrets());
    expect(out.sent).toBe(true);
    expect(out.fetched).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const allCalls = sendMock.mock.calls as unknown as Array<Array<{
      toAddress?: string;
      subjectOverride?: string;
      htmlBodyOverride?: string;
    }>>;
    const call = allCalls[0]?.[0] ?? {};
    expect(call.toAddress).toBe('admin@chefflow.uk');
    expect(call.subjectOverride).toContain('2 emails');
    expect(call.htmlBodyOverride).toContain('P1');
    expect(call.htmlBodyOverride).toContain('Sam confirms');
  });
});
