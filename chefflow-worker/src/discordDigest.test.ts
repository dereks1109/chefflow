import { describe, it, expect, vi } from 'vitest';
import { sendDiscordDigest, type DiscordDigestEnv } from './discordDigest';
import type { GmailDigestItem } from './gmailDigest';
import type { ContactSubmission } from './contact';

function mkUrgent(priority: 1 | 2, oneLine: string, from?: string, subject?: string): GmailDigestItem {
  return { priority, oneLine, from, subject };
}

function mkSubmission(over: Partial<ContactSubmission>): ContactSubmission {
  return {
    id: 's1',
    name: 'Alice',
    email: 'alice@example.com',
    message: 'hi',
    ip: '1.2.3.4',
    createdAt: Date.parse('2026-05-29T10:00:00Z'),
    ...over,
  };
}

function mkEnv(over: Partial<DiscordDigestEnv> = {}): DiscordDigestEnv {
  return { DISCORD_DIGEST_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc', ...over };
}

describe('sendDiscordDigest', () => {
  it('skips with no-webhook when DISCORD_DIGEST_WEBHOOK_URL is unset', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const out = await sendDiscordDigest(
      { DISCORD_DIGEST_WEBHOOK_URL: undefined },
      { dayLabel: '2026-05-29', urgentItems: [mkUrgent(1, 'urgent')], inboxItemCount: 1 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-webhook');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('defensive no-op when urgentItems is empty (caller should also check)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const out = await sendDiscordDigest(
      mkEnv(),
      { dayLabel: '2026-05-29', urgentItems: [], inboxItemCount: 5 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(out.sent).toBe(false);
    expect(out.skipReason).toBe('no-urgent');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs an inbox embed with one field per urgent item (P1 first)', async () => {
    let postedUrl: string | undefined;
    let postedBody: unknown;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      postedUrl = url;
      postedBody = init?.body;
      return new Response(null, { status: 204 });
    });

    const out = await sendDiscordDigest(
      mkEnv(),
      {
        dayLabel: '2026-05-29',
        urgentItems: [
          mkUrgent(2, 'reminder: invoice due', 'acme', 'Invoice'),
          mkUrgent(1, 'customer wants refund today', 'cust', 'Refund'),
        ],
        inboxItemCount: 7,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(out.sent).toBe(true);
    expect(out.status).toBe(204);
    expect(postedUrl).toBe('https://discord.com/api/webhooks/123/abc');
    const body = JSON.parse(postedBody as string) as {
      username: string;
      embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
    };
    expect(body.username).toBe('ChefFlow Daily Digest');
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toContain('urgent inbox item');
    // P1 first: customer-refund item is in field[0], invoice (P2) in field[1].
    expect(body.embeds[0].fields[0].name).toContain('[P1]');
    expect(body.embeds[0].fields[0].name).toContain('customer wants refund');
    expect(body.embeds[0].fields[1].name).toContain('[P2]');
  });

  it('adds a contact embed when submissions are present', async () => {
    let postedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = init?.body;
      return new Response(null, { status: 204 });
    });
    await sendDiscordDigest(
      mkEnv(),
      {
        dayLabel: '2026-05-29',
        urgentItems: [mkUrgent(1, 'urgent')],
        inboxItemCount: 1,
        contactSubmissions: [
          mkSubmission({ id: 's1', name: 'Bob', email: 'bob@example.com', message: 'hello world' }),
        ],
      },
      fetchImpl as unknown as typeof fetch,
    );
    const body = JSON.parse(postedBody as string) as {
      embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
    };
    expect(body.embeds).toHaveLength(2);
    expect(body.embeds[1].title).toContain('contact submission');
    expect(body.embeds[1].fields[0].name).toContain('Bob');
    expect(body.embeds[1].fields[0].value).toContain('hello world');
  });

  it('marks send-failed on a non-2xx HTTP status (logs warn, no throw)', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = await sendDiscordDigest(
        mkEnv(),
        { dayLabel: '2026-05-29', urgentItems: [mkUrgent(1, 'urgent')], inboxItemCount: 1 },
        fetchImpl as unknown as typeof fetch,
      );
      expect(out.sent).toBe(false);
      expect(out.skipReason).toBe('send-failed');
      expect(out.status).toBe(429);
    } finally {
      warn.mockRestore();
    }
  });
});
