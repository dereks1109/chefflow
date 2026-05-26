import { describe, it, expect, vi } from 'vitest';
import { sendContactNotification, MailNotificationError } from './contactMail';

const VALID_KEY = 're_test_dummykey_111111';

function fetchReturning(status: number, body: string = ''): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe('sendContactNotification (Resend)', () => {
  it('POSTs to api.resend.com with Bearer auth + expected envelope', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: 'resend-id-123' }), { status: 200 });
    }) as unknown as typeof fetch;

    await sendContactNotification({
      apiKey: VALID_KEY,
      name: 'Alice Smith',
      email: 'alice@example.com',
      message: 'Hi — quick question about ingredient scaling.',
      fetchImpl,
    });

    expect(captured?.url).toBe('https://api.resend.com/emails');
    expect(captured?.init?.method).toBe('POST');
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${VALID_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    const payload = JSON.parse(captured?.init?.body as string) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
      reply_to: string;
    };
    expect(payload.to).toEqual(['admin@chefflow.uk']);
    expect(payload.from).toBe('ChefFlow Contact Form <noreply@chefflow.uk>');
    expect(payload.reply_to).toBe('alice@example.com');
    expect(payload.subject).toContain('Alice Smith');
    expect(payload.text).toContain('Hi — quick question about ingredient scaling.');
    expect(payload.html).toContain('<h2');
    expect(payload.html).toContain('Alice Smith');
  });

  it('honors a custom toAddress / fromAddress override', async () => {
    let payload: { to: string[]; from: string } | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      payload = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await sendContactNotification({
      apiKey: VALID_KEY,
      name: 'Bob',
      email: 'bob@example.com',
      message: 'hello',
      toAddress: 'alerts@chefflow.uk',
      fromAddress: 'noreply@chefflow.uk',
      fetchImpl,
    });
    expect(payload?.to).toEqual(['alerts@chefflow.uk']);
    expect(payload?.from).toBe('noreply@chefflow.uk');
  });

  it('escapes HTML special chars so a malicious name/message cannot break the markup', async () => {
    let html = '';
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string) as { html: string };
      html = payload.html;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await sendContactNotification({
      apiKey: VALID_KEY,
      name: '<script>alert(1)</script>',
      email: 'hax@example.com',
      message: 'inject me <img onerror=alert(1)>',
      fetchImpl,
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('inject me &lt;img onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('throws MailNotificationError with the status on 4xx', async () => {
    const fetchImpl = fetchReturning(401, '{"message":"invalid_api_key"}');
    await expect(
      sendContactNotification({
        apiKey: VALID_KEY,
        name: 'Alice',
        email: 'alice@example.com',
        message: 'hi',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws when apiKey is missing or empty without making any HTTP request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      sendContactNotification({
        apiKey: '',
        name: 'Alice',
        email: 'alice@example.com',
        message: 'hi',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(MailNotificationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws on 5xx (Resend outage)', async () => {
    const fetchImpl = fetchReturning(503, '{"message":"service unavailable"}');
    await expect(
      sendContactNotification({
        apiKey: VALID_KEY,
        name: 'Alice',
        email: 'alice@example.com',
        message: 'hi',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
